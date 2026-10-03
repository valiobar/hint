FROM nginx:alpine

ARG VITE_API_URL=http://localhost:8000
ARG VITE_WIDGET_CDN_URL=http://localhost:1337
# Per-database tenant id. Keep the source placeholder; CI passes the live id.
ARG DEMO_COMPANY_ID=cmp_YOUR_ID

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html USER_MANUAL.md ADMIN_USER_MANUAL.md /usr/share/nginx/html/

# Source HTML uses localhost URLs and a placeholder company id.
# Production CI passes the public hosts and the live tenant.
RUN sed -i \
	-e "s#http://localhost:1337#${VITE_WIDGET_CDN_URL}#g" \
	-e "s#http://localhost:8000#${VITE_API_URL}#g" \
	-e "s#data-hint-company-id=\"cmp_YOUR_ID\"#data-hint-company-id=\"${DEMO_COMPANY_ID}\"#g" \
	/usr/share/nginx/html/index.html

EXPOSE 80
