FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
ARG VITE_API_URL
ARG VITE_WIDGET_CDN_URL
ENV VITE_API_URL=$VITE_API_URL VITE_WIDGET_CDN_URL=$VITE_WIDGET_CDN_URL
COPY package.json pnpm-lock.yaml ./
RUN corepack prepare pnpm@9.15.9 --activate \
	&& pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
