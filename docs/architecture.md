# Architecture

This repository implements a two-EC2-instance observability pipeline for a Node.js application. See the main project overview in [README.md](README.md) for full setup and run instructions; this document summarizes the architecture and points to the configuration files.

## Diagram

- Architecture diagram: [docs/images/arch.png](docs/images/arch.png)

## Overview

- One instance (`node-ec2`) runs the Node.js app, `node-exporter`, `cAdvisor`, and `promtail`.
- A second instance (`monitor-ec2`) runs Prometheus, Loki, and Grafana to store, index, and visualize metrics and logs.
- Prometheus pulls metrics from scrape targets on the app instance; Promtail pushes container logs to Loki on the observability instance.

## Components & Configs

- App server configuration: [config_files/node-app-ec2](config_files/node-app-ec2/) — Promtail configuration is at [config_files/node-app-ec2/promtail/promtail-config.yaml](config_files/node-app-ec2/promtail/promtail-config.yaml).
- Observability server configuration: [config_files/monitor-ec2](config_files/monitor-ec2/) — includes Prometheus and Loki configs:
  - [config_files/monitor-ec2/prometheus/prometheus.yml](config_files/monitor-ec2/prometheus/prometheus.yml)
  - [config_files/monitor-ec2/loki/loki-config.yml](config_files/monitor-ec2/loki/loki-config.yml)
- Docker run instructions: [docker-commands.md](docker-commands.md)

## Network & Security

- All services communicate over the private EC2 network. The IP addresses referenced in the config files are private EC2 addresses used to keep traffic internal for lower latency and reduced AWS networking cost (see README).
- Security groups are configured so only the paired instance can reach internal ports (Prometheus scrapes and Loki ingestion remain closed to the public internet).

## Data Flow

- Metrics: Prometheus (on `monitor-ec2`) periodically pulls `/metrics` endpoints from `node-ec2`, `node-exporter`, and `cAdvisor`.
- Logs: Promtail (on `node-ec2`) discovers Docker containers via `docker_sd_configs` and pushes logs to Loki (on `monitor-ec2`).

## Where to look next

- Full deployment and run commands: [docker-commands.md](docker-commands.md)
- Configuration details and active values: [config_files](config_files/)
- Project overview and rationale: [README.md](README.md)

---
