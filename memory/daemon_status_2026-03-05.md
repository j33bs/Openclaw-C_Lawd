QMD MCP port 8181 offline (persistent).

AIN Φ update (2026-03-05 16:37):
- Proxy implemented/deployed: ain-phi.service (user systemd).
- Port: 127.0.0.1:18991 (moved from 18990).
- Endpoint: GET http://127.0.0.1:18991/api/ain/phi?n_samples=10
- phi=0.0 (no recent embeddings).
- Log: /var/log/ain_phi.jsonl
- Audit: workspace/audit/ain_phi_server_20260305T062511Z.md

Local MacBook: No listener 18991 (curl fail). z490?