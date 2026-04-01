---
name: ec2
description: Check AWS EC2 instance status, services, logs, and system resources. Use when the user asks about EC2, server status, marvix services, deployment state, or wants to manage the production server.
---

# EC2 Instance Management

Production EC2 instance running nova-quant backend services.

## Connection Details

| Key      | Value                    |
| -------- | ------------------------ |
| Host     | `16.58.223.95`           |
| User     | `ubuntu`                 |
| PEM      | `~/.ssh/marvix-prod.pem` |
| Code dir | `/opt/nova-quant/`       |
| Region   | us-east-2                |

SSH base command:

```
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95
```

## Services

Four services run on this instance:

| Service                    | Role                                                                           | Port |
| -------------------------- | ------------------------------------------------------------------------------ | ---- |
| `marvix.service`           | API server + Web frontend (`tsx src/server/apiServer.ts`)                      | 8787 |
| `marvix-backend.service`   | Automated worker (signal generation, market collection, 120s cycle)            | --   |
| `nova-qlib-bridge.service` | Qlib Python sidecar (factor/prediction API, depends on marvix-backend)         | --   |
| `nginx`                    | Reverse proxy `api.novaquant.cloud:443` -> `localhost:8787`, Let's Encrypt SSL | 443  |

## Permission Model

- **Read-only operations** (status, logs, curl, resource checks, git status): execute directly, NO need to ask BW for confirmation.
- **State-changing operations** (restart, deploy, edit files on server): MUST get explicit confirmation from BW before execution.

### 0. API Endpoint Check (external)

```bash
curl -s -o /dev/null -w "HTTP %{http_code} | Time: %{time_total}s | Size: %{size_download} bytes" https://api.novaquant.cloud/
```

### 1. Service Status

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "echo '=== Services ===' && systemctl status marvix.service marvix-backend.service nova-qlib-bridge.service nginx --no-pager -l"
```

### 2. Service Logs

```bash
# Last N lines (default 50)
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "journalctl -u marvix.service --no-pager -n 50"
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "journalctl -u marvix-backend.service --no-pager -n 50"
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "journalctl -u nova-qlib-bridge.service --no-pager -n 50"
```

### 3. System Resources

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "echo '=== Disk ===' && df -h / && echo '' && echo '=== Memory ===' && free -h && echo '' && echo '=== CPU Load ===' && uptime && echo '' && echo '=== Top Processes ===' && ps aux --sort=-%mem | head -10"
```

### 4. Network / Ports

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "echo '=== Listening Ports ===' && sudo ss -tlnp | grep -v '127.0.0.53'"
```

### 5. Git Status (deployment state)

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "cd /opt/nova-quant && echo '=== Branch ===' && git branch -v && echo '' && echo '=== Last 5 Commits ===' && git log --oneline -5 && echo '' && echo '=== Local Changes ===' && git status --short | head -20"
```

### 6. Database Size

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "ls -lh /opt/nova-quant/data/quant.db"
```

### 7. Restart Services (REQUIRES CONFIRMATION)

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "sudo systemctl restart marvix.service marvix-backend.service nova-qlib-bridge.service"
```

### 8. Deploy Update (REQUIRES CONFIRMATION)

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "cd /opt/nova-quant && git pull origin main && npm ci --production && npm run build && sudo systemctl restart marvix.service marvix-backend.service nova-qlib-bridge.service"
```

## Quick Health Check

Combine the most important checks (run curl and SSH in parallel):

```bash
# Parallel call 1: external API check
curl -s -o /dev/null -w "HTTP %{http_code} | Time: %{time_total}s | Size: %{size_download} bytes" https://api.novaquant.cloud/

# Parallel call 2: internal checks
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "echo '=== Hostname ===' && hostname && echo '' && echo '=== Uptime ===' && uptime && echo '' && echo '=== Services ===' && systemctl is-active marvix.service marvix-backend.service nova-qlib-bridge.service nginx && echo '' && echo '=== Memory ===' && free -h | grep Mem && echo '' && echo '=== Disk ===' && df -h / | tail -1 && echo '' && echo '=== Port 8787 ===' && ss -tlnp | grep 8787 && echo '' && echo '=== Git HEAD ===' && cd /opt/nova-quant && git log --oneline -1"
```

## Deep Check (include error scanning)

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "echo '=== Recent ERRORs (marvix) ===' && journalctl -u marvix.service --no-pager -n 100 2>&1 | grep -i 'error\|fatal\|exception\|crash' | tail -10 && echo '' && echo '=== Recent ERRORs (marvix-backend) ===' && journalctl -u marvix-backend.service --no-pager -n 100 2>&1 | grep -i 'error\|fatal\|exception\|crash' | tail -10 && echo '' && echo '=== Recent ERRORs (nova-qlib-bridge) ===' && journalctl -u nova-qlib-bridge.service --no-pager -n 100 2>&1 | grep -i 'error\|fatal\|exception\|crash' | tail -10 && echo '' && echo '=== Nginx ERRORs (last 10) ===' && sudo tail -10 /var/log/nginx/error.log 2>/dev/null || echo 'no error log'"
```

## Admin Endpoint Benchmark

Run the 6 admin data functions directly on EC2 to measure response times. Write a temp tsx file, execute, then clean up.

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 'cd /opt/nova-quant && cat > /opt/nova-quant/_bench.ts << '\''SCRIPT'\''
import { buildAdminOverviewHeadlineFast, buildAdminOverviewSnapshot, buildAdminUsersSnapshot, buildAdminAlphaSnapshot, buildAdminSignalsSnapshot, buildAdminSystemSnapshot } from "./src/server/admin/service.js";

async function main() {
  const tests: [string, () => Promise<unknown> | unknown][] = [
    ["headline", buildAdminOverviewHeadlineFast],
    ["overview", buildAdminOverviewSnapshot],
    ["users", buildAdminUsersSnapshot],
    ["alphas", buildAdminAlphaSnapshot],
    ["signals", buildAdminSignalsSnapshot],
    ["system", buildAdminSystemSnapshot],
  ];
  for (const [name, fn] of tests) {
    const t = Date.now();
    try {
      await fn();
      console.log(name + ": " + (Date.now() - t) + "ms");
    } catch(e: any) {
      console.log(name + ": ERROR " + (Date.now() - t) + "ms -- " + e.message.slice(0, 150));
    }
  }
  process.exit(0);
}
main();
SCRIPT
npx tsx /opt/nova-quant/_bench.ts && rm /opt/nova-quant/_bench.ts'
```

Baseline (2026-03-29 post-optimization): headline 32ms, overview 2s, users 0ms, alphas 59ms, signals 7ms, system 194ms.

## Deployment Verification

After a deploy, verify the EC2 commit matches local main and services are healthy:

```bash
# Parallel call 1: local HEAD
git log --oneline -1

# Parallel call 2: EC2 HEAD + service status
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "cd /opt/nova-quant && echo '=== EC2 HEAD ===' && git log --oneline -1 && echo '' && echo '=== Services ===' && systemctl is-active marvix.service marvix-backend.service nova-qlib-bridge.service nginx && echo '' && echo '=== Port 8787 ===' && ss -tlnp | grep 8787"
```

Compare the two commit hashes -- they should match after a successful deploy.

## Workflow

1. BW asks about EC2 / server status
2. **Read-only checks**: execute directly without asking
3. Present results in a clean table format
4. **State-changing operations** (restart, deploy, file edits): explain what will happen and get explicit approval from BW before executing
