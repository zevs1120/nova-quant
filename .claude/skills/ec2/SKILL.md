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

Three services run on this instance:

| Service                  | Role                                                                           | Port |
| ------------------------ | ------------------------------------------------------------------------------ | ---- |
| `marvix.service`         | API server + Web frontend (`tsx src/server/apiServer.ts`)                      | 8787 |
| `marvix-backend.service` | Automated worker (signal generation, market collection, 120s cycle)            | --   |
| `nginx`                  | Reverse proxy `api.novaquant.cloud:443` -> `localhost:8787`, Let's Encrypt SSL | 443  |

## Available Operations

**IMPORTANT**: Every operation that modifies state (restart, deploy) MUST be confirmed with BW before execution. Read-only status checks can proceed after confirmation too -- always ask before running SSH commands.

### 1. Service Status

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "echo '=== Services ===' && systemctl status marvix.service marvix-backend.service nginx --no-pager -l"
```

### 2. Service Logs

```bash
# Last N lines (default 50)
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "journalctl -u marvix.service --no-pager -n 50"
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "journalctl -u marvix-backend.service --no-pager -n 50"
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
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "sudo systemctl restart marvix.service marvix-backend.service"
```

### 8. Deploy Update (REQUIRES CONFIRMATION)

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "cd /opt/nova-quant && git pull origin main && npm ci --production && npm run build && sudo systemctl restart marvix.service marvix-backend.service"
```

## Quick Health Check

Combine the most important checks in one command:

```bash
ssh -i ~/.ssh/marvix-prod.pem ubuntu@16.58.223.95 "echo '=== Hostname ===' && hostname && echo '' && echo '=== Uptime ===' && uptime && echo '' && echo '=== Services ===' && systemctl is-active marvix.service marvix-backend.service nginx && echo '' && echo '=== Memory ===' && free -h | grep Mem && echo '' && echo '=== Disk ===' && df -h / | tail -1 && echo '' && echo '=== Port 8787 ===' && ss -tlnp | grep 8787 && echo '' && echo '=== Git HEAD ===' && cd /opt/nova-quant && git log --oneline -1"
```

## Workflow

1. BW asks about EC2 / server status
2. Describe which checks you will run and ask for confirmation
3. Run the approved SSH command(s)
4. Present results in a clean table format
5. For state-changing operations (restart, deploy), always explain what will happen and get explicit approval
