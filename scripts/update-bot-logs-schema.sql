-- Update bot_logs table to support comprehensive activity logging
-- This adds better support for tracking: swap, distribute, send eth, withdraw, etc.

-- Add comment to document action types
COMMENT ON COLUMN bot_logs.action IS 'Activity type:
- swap_started: Bot wallet memulai swap
- swap_completed: Swap berhasil
- swap_failed: Swap gagal
- credit_distributed: Credits didistribusikan dari main wallet ke bot wallet
- eth_sent: Native ETH dikirim
- weth_sent: WETH dikirim
- eth_received: Menerima ETH
- weth_received: Menerima WETH
- token_sent: Token dikirim
- token_received: Token diterima
- weth_deposited: ETH dikonversi ke WETH (deposit)
- weth_withdrawn: WETH dikonversi ke ETH (withdraw)
- insufficient_balance: Balance tidak cukup
- system_message: Pesan sistem lainnya';

-- Add index for action type for faster filtering
CREATE INDEX IF NOT EXISTS idx_bot_logs_action 
ON bot_logs(action);

-- Add index for combined user + action for efficient queries
CREATE INDEX IF NOT EXISTS idx_bot_logs_user_action 
ON bot_logs(user_address, action, created_at DESC);

