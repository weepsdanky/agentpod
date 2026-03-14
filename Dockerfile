FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY hub ./hub
COPY plugin ./plugin

RUN pnpm install --no-frozen-lockfile

EXPOSE 4590

CMD ["pnpm", "hub:dev", "--", "--bind", "0.0.0.0:4590", "--mode", "private", "--network-id", "team-a"]
