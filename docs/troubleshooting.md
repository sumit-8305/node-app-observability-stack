# Troubleshooting

This document captures known failures, their symptoms, root causes, and practical remediation steps for the two-EC2 observability setup. See the main overview in `README.md` and the live configuration files under `config_files/` for exact values.

## 1) Observer EC2 hangs / Docker containers stop responding

Symptoms
- Grafana / Prometheus / Loki UI become unresponsive
- Docker containers stop or restart repeatedly
- High system load, OOM, or systemd/Docker service restarts

Likely root cause
- Running the observability stack (Prometheus, Loki, Grafana, node-exporter) on a small instance type (e.g., `t3.micro`) can exhaust CPU credits, memory, or disk I/O, causing the instance to become unresponsive.

Immediate fix
- Stop the instance, then restart it (as you did). After reboot, start the Docker containers again:

```bash
# on the observability instance
docker ps -a
docker start <container-name>
# or use your documented docker run commands in docker-commands.md
```

Remediation / prevention
- Move the observability stack to a larger instance type (e.g., `t3.medium` or larger) for production-like workloads.
- Limit Loki retention or reduce Prometheus retention and scrape frequency to lower resource usage.
- Add monitoring/alarms on instance metrics (CPU, memory, disk) to detect resource exhaustion early.

Notes
- Short-lived solution: restarting frees resources temporarily but does not prevent recurrence on undersized instances.

## 2) Security Group rule change from IP to Security Group reference

Symptoms
- After replacing an inbound/outbound rule that used an IP with a rule referencing another security group, connections still fail or the previous IP-based rule persists.

Root cause
- AWS does not allow changing the type/source of an existing rule from a CIDR/IP to a security-group reference in-place. Attempting to edit can lead to stale or conflicting rules.

Fix
- Delete the existing rule that used the CIDR/IP, then create a new rule that references the security group ID as the source/destination.

Example (console):
- Remove the old rule from the Security Group's inbound/outbound list.
- Add a new rule with the source type set to "Custom" and choose the other Security Group ID.

Prevention / best practice
- Plan rule changes: prefer creating the new SG rule first, then remove the old IP rule during a maintenance window.
- Use infrastructure-as-code (CloudFormation / Terraform) so rule changes are applied idempotently and version-controlled.

## 3) Prometheus scraping remote services — do not use localhost

Symptoms
- Prometheus shows targets as DOWN for services that are actually running on another EC2 instance; dashboards show no data for those services.

Root cause
- Using `localhost:<port>` in `prometheus.yml` only works for services running on the same host as Prometheus. When Prometheus runs on a different EC2 instance, `localhost` resolves to the Prometheus host, not the remote service.

Fix
- Replace `localhost:<port>` with the target instance's private IP or private DNS name in `config_files/monitor-ec2/prometheus/prometheus.yml`.

Example

```yaml
# Incorrect: assumes Loki runs on the same host as Prometheus
- job_name: 'loki'
	static_configs:
		- targets: ['localhost:3100']

# Correct: use the private EC2 IP (or private DNS) of the instance running Loki
- job_name: 'loki'
	static_configs:
		- targets: ['172.31.26.179:3100']
```

Guidance
- Prefer private DNS names or Route53 private records where possible to avoid hardcoding IPs.
- Ensure Security Group rules permit traffic from the Prometheus instance to the target port.
- After updating `prometheus.yml`, reload Prometheus configuration (`POST /-/reload`) or restart the container to apply changes.

