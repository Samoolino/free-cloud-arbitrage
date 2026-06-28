import argparse
import logging
import os
import signal
import sys
import time
from typing import Any, Optional

import ccxt
from dotenv import load_dotenv
from supabase import create_client

WORKER_ROOT = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(WORKER_ROOT, ".env")
REQUIREMENTS_FILE = os.path.join(WORKER_ROOT, "requirements.txt")
LOG_FILE = os.getenv("WORKER_LOG_FILE", os.path.join(WORKER_ROOT, "worker.log"))

load_dotenv(dotenv_path=ENV_FILE)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
    ],
)

logger = logging.getLogger("ccxt-worker")

supabase_client = None
exchange_instance = None
should_run = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CCXT trading worker")
    parser.add_argument("--once", action="store_true", help="Run one polling cycle and exit")
    return parser.parse_args()


def handle_shutdown(signum: int, frame: Any) -> None:
    global should_run
    should_run = False
    logger.info("Shutdown signal received; stopping worker gracefully")


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)


def get_supabase_client():
    global supabase_client
    if supabase_client is None:
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        if not supabase_url or not supabase_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")
        supabase_client = create_client(supabase_url, supabase_key)
    return supabase_client


def get_exchange_id() -> str:
    return os.getenv("EXCHANGE_ID", "binance").lower()


def build_exchange_config(exchange_id: str) -> dict[str, Any]:
    config: dict[str, Any] = {
        "apiKey": os.getenv("EXCHANGE_API_KEY"),
        "secret": os.getenv("EXCHANGE_SECRET_KEY"),
        "enableRateLimit": True,
    }

    if exchange_id in {"kucoin", "okx"}:
        passphrase = (
            os.getenv("EXCHANGE_PASSPHRASE")
            or os.getenv("EXCHANGE_PASSWORD")
            or os.getenv(f"{exchange_id.upper()}_PASSPHRASE")
        )
        if passphrase:
            config["password"] = passphrase
        config["options"] = {"defaultType": "spot"}

    return config


def get_exchange_instance():
    global exchange_instance
    if exchange_instance is None:
        exchange_id = get_exchange_id()
        if exchange_id not in ccxt.exchanges:
            raise ValueError(f"Exchange '{exchange_id}' is not supported by CCXT")

        exchange_class = getattr(ccxt, exchange_id)
        exchange_config = build_exchange_config(exchange_id)
        exchange_instance = exchange_class(exchange_config)
    return exchange_instance


def get_signals_table() -> str:
    return os.getenv("SUPABASE_SIGNALS_TABLE", "trading_signals")


def get_pending_status() -> str:
    return os.getenv("SUPABASE_PENDING_STATUS", "pending")


def get_completed_status() -> str:
    return os.getenv("SUPABASE_COMPLETED_STATUS", "completed")


def get_failed_status() -> str:
    return os.getenv("SUPABASE_FAILED_STATUS", "failed")


def fetch_lovable_signals() -> list[dict[str, Any]]:
    client = get_supabase_client()
    response = (
        client.table(get_signals_table())
        .select("*")
        .eq("status", get_pending_status())
        .execute()
    )
    return response.data or []


def update_signal_status(signal_id: Any, status: str, extra_fields: Optional[dict[str, Any]] = None) -> None:
    client = get_supabase_client()
    payload = {"status": status}
    if extra_fields:
        payload.update(extra_fields)
    client.table(get_signals_table()).update(payload).eq("id", signal_id).execute()


def is_no_loss_safe(signal: dict[str, Any]) -> bool:
    if os.getenv("NO_LOSS_MODE", "true").lower() not in {"1", "true", "yes", "on"}:
        return True

    if signal.get("dry_run") in {True, "true", "1"}:
        return False

    if signal.get("stop_loss") is None and signal.get("take_profit") is None:
        return False

    amount = signal.get("amount")
    try:
        if amount is not None and float(amount) <= 0:
            return False
    except (TypeError, ValueError):
        return False

    return True


def execute_trade(signal: dict[str, Any]) -> None:
    symbol = signal.get("symbol")
    side = signal.get("side")
    amount = signal.get("amount")

    if not symbol or not side or amount is None:
        logger.warning("Skipping incomplete signal: %s", signal)
        return

    if not is_no_loss_safe(signal):
        logger.info("Skipping signal due to no-loss safety rules: %s", signal)
        update_signal_status(signal["id"], get_failed_status(), {"error_message": "Skipped by no-loss guard"})
        return

    try:
        exchange = get_exchange_instance()
        logger.info("Executing %s order for %s %s on %s", side, amount, symbol, get_exchange_id())
        order = exchange.create_market_order(symbol, side, amount)
        update_signal_status(
            signal["id"],
            get_completed_status(),
            {"order_id": order.get("id"), "exchange_id": get_exchange_id()},
        )
    except Exception as exc:
        logger.exception("Trade execution failed for signal %s", signal["id"])
        update_signal_status(signal["id"], get_failed_status(), {"error_message": str(exc)})


def main() -> None:
    args = parse_args()
    logger.info("Python worker ready")
    logger.info("Worker root: %s", WORKER_ROOT)
    logger.info("Env file exists: %s", os.path.exists(ENV_FILE))
    logger.info("Requirements file exists: %s", os.path.exists(REQUIREMENTS_FILE))
    logger.info("Using exchange: %s", get_exchange_id())

    interval_seconds = int(os.getenv("POLL_INTERVAL_SECONDS", "5"))

    while should_run:
        try:
            signals = fetch_lovable_signals()
            if signals:
                logger.info("Found %s pending signals", len(signals))
            for signal in signals:
                execute_trade(signal)
        except Exception as exc:
            logger.exception("Worker loop error: %s", exc)

        if args.once:
            break
        time.sleep(interval_seconds)

    logger.info("Worker stopped")


if __name__ == "__main__":
    main()
