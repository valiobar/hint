FROM nginx:alpine

ARG VITE_API_URL=http://localhost:8000
ARG VITE_WIDGET_CDN_URL=http://localhost:1337

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html USER_MANUAL.md ADMIN_USER_MANUAL.md /usr/share/nginx/html/

# Source HTML uses localhost URLs; production CI passes the public host.
RUN sed -i \
	-e "s#http://localhost:1337#${VITE_WIDGET_CDN_URL}#g" \
	-e "s#http://localhost:8000#${VITE_API_URL}#g" \
	/usr/share/nginx/html/index.html

EXPOSE 80
