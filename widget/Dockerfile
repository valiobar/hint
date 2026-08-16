FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack prepare pnpm@9.15.9 --activate \
	&& pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Hashed filenames change every build (`hint-widget.{hash}.js/.css`) and
# loader.js is generated into dist/ — copy the whole directory. Fixed
# COPY lines for hint-widget.js / public/loader.js would break the first
# hashed build.
COPY --from=build /app/dist/ /usr/share/nginx/html/embed/v1/
