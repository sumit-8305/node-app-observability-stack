# Docker commands — node-app-observability-stack

Two EC2 instances, both running Amazon Linux 2023 with Docker installed via user data.

> **Before running any commands below**, make sure the following config files already exist at the paths referenced (`$(pwd)/...`), either cloned from the repo or created manually:
> - `prometheus.yml`
> - `loki-config.yaml`
> - `promtail-config.yaml`
>
> Run each block from the directory containing its matching config file, since the mount paths use `$(pwd)`.

---

## EC2 #1 — app server

### node-app
```bash
docker build -t node-app .
docker run -d --name node-app -p 2000:2000 node-app
```

### node-exporter (host metrics)
```bash
docker run -d \
  --name node-exporter \
  --net="host" \
  --pid="host" \
  -v "/:/host:ro,rslave" \
  quay.io/prometheus/node-exporter:latest \
  --path.rootfs=/host
```

### cadvisor (per-container metrics)
```bash
docker run -d \
  --name cadvisor \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /:/rootfs:ro \
  -v /var/run:/var/run:ro \
  -v /sys:/sys:ro \
  -v /var/lib/docker/:/var/lib/docker:ro \
  -v /dev/disk/:/dev/disk:ro \
  --privileged \
  --device=/dev/kmsg \
  gcr.io/cadvisor/cadvisor:latest
```

### promtail (ships logs to Loki on EC2 #2)
> Requires `promtail-config.yaml` to be present in the current directory, with the `clients.url` field pointing at EC2 #2's private IP.
```bash
docker run -d \
  --name promtail \
  -v $(pwd)/promtail-config.yaml:/etc/promtail/config.yaml \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /var/lib/docker/containers:/var/lib/docker/containers:ro \
  grafana/promtail:2.9.0 \
  -config.file=/etc/promtail/config.yaml
```

---

## EC2 #2 — observability server

### shared docker network
```bash
docker network create observability-net
```

### prometheus
> Requires `prometheus.yml` to be present in the current directory, with scrape targets pointing at EC2 #1's private IP (and EC2 #2's own private IP for its node-exporter).
```bash
docker run -d \
  --name prometheus \
  --network observability-net \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

### loki
> Requires `loki-config.yaml` to be present in the current directory.
```bash
docker run -d \
  --name loki \
  --network observability-net \
  -p 3100:3100 \
  -v $(pwd)/loki-config.yaml:/etc/loki/local-config.yaml \
  -v loki-data:/loki \
  grafana/loki:2.9.0 \
  -config.file=/etc/loki/local-config.yaml
```

### grafana
```bash
docker run -d \
  --name grafana \
  --network observability-net \
  -p 3000:3000 \
  grafana/grafana
```

### node-exporter (host metrics for this instance)
```bash
docker run -d \
  --name node-exporter \
  --net="host" \
  --pid="host" \
  -v "/:/host:ro,rslave" \
  quay.io/prometheus/node-exporter:latest \
  --path.rootfs=/host
```

---

## Port reference

| Instance | Container | Port | Purpose |
|---|---|---|---|
| EC2 #1 | node-app | 2000 | App + `/metrics` endpoint |
| EC2 #1 | node-exporter | 9100 | Host CPU/mem/disk metrics |
| EC2 #1 | cadvisor | 8080 | Per-container resource metrics |
| EC2 #1 | promtail | — | Reads `docker.sock`, pushes logs out |
| EC2 #2 | prometheus | 9090 | Scrapes all metric sources |
| EC2 #2 | loki | 3100 | Receives pushed logs |
| EC2 #2 | grafana | 3000 | Dashboards, queries Prometheus + Loki |
| EC2 #2 | node-exporter | 9100 | Host metrics for monitor-ec2 itself |