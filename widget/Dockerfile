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
COPY --from=build /app/dist/hint-widget.js /usr/share/nginx/html/embed/v1/
COPY --from=build /app/public/loader.js       /usr/share/nginx/html/embed/v1/
