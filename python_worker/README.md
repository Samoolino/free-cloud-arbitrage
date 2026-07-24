# Python Worker Setup Guide

This folder contains a safe, first-run friendly CCXT worker that can connect to Lovable/Supabase and execute trades through a configurable exchange.

## 1. Prepare the environment

Open the repo in VS Code and use the integrated terminal.

```powershell
cd python_worker
py -3 -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

## 2. Configure environment variables

Create or edit the `.env` file in this folder.

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-role-key

# Lovable HMAC auth for executor.py
LOVABLE_BASE_URL=https://yourapp.lovable.app
BOT_SHARED_SECRET=your_shared_secret
BOT_USER_ID=your_user_uuid

SUPABASE_SIGNALS_TABLE=trading_signals
SUPABASE_PENDING_STATUS=pending
SUPABASE_COMPLETED_STATUS=completed
SUPABASE_FAILED_STATUS=failed

EXCHANGE_ID=binance
EXCHANGE_API_KEY=your_api_key
EXCHANGE_SECRET_KEY=your_secret_key

# Optional for KuCoin / OKX
EXCHANGE_PASSPHRASE=your_passphrase

# Worker behavior
POLL_INTERVAL_SECONDS=5
NO_LOSS_MODE=true
WORKER_LOG_FILE=worker.log
```

## 3. Run a safe first test

Use a single dry-run cycle first with the simple signal worker:

```powershell
python worker.py --once
```

Validate the Lovable executor auth flow and CCXT client setup without placing real orders:

```powershell
python executor.py --dry-run --once
```

This will poll queued intents once, simulate order placement, and report fills back to the app.

## 4. Run the live Lovable executor

For live order placement through the Lovable intent queue, run:

```powershell
python executor.py --live
```

This worker will poll `/api/public/bot/intents`, create live CCXT orders, and report fills back to the dashboard.

## 5. Run the async arbitrage orderbook worker

For real-time orderbook streaming and depth-based opportunity checks:

```powershell
python arbitrage_worker.py
```

This worker connects to multiple exchange feeds concurrently and writes arbitrage signals into the Supabase table `arbitrage_signals`.

## 5. Run as a background service

For normal continuous operation:

```bash
python worker.py
```

The worker will keep polling until you stop it with Ctrl+C.

## 6. Run on Linux / WSL

For Linux or WSL deployments, use the portable launcher instead of the Windows-only PowerShell path:

```bash
cd python_worker
chmod +x start_worker.sh
./start_worker.sh
```

The launcher uses the current Python interpreter by default and supports `PYTHON_EXE` when you want to point at a specific virtualenv or Conda environment.

To run the worker as a long-lived process with systemd, copy the sample unit file and edit the path and user:

```bash
sudo cp python_worker/free-cloud-arbitrage-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now free-cloud-arbitrage-worker
```

## 7. Run as a Windows service

If you want the worker to start automatically on boot on Windows, run the PowerShell installer from the repo root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
powershell -ExecutionPolicy Bypass -File .\python_worker\install_service.ps1
```

If NSSM is installed, this registers the worker as a Windows service named `FreeCloudArbitrageWorker`.

To stop or start it later:

```powershell
Stop-Service -Name FreeCloudArbitrageWorker
Start-Service -Name FreeCloudArbitrageWorker
```

## 8. Safety notes

- Keep `NO_LOSS_MODE=true` while testing.
- Use sandbox/testnet credentials when available.
- Verify your Supabase table names and statuses before running live orders.
