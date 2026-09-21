# Optional: serve the site with nginx  →  docker build -t fr-foundry . && docker run -p 8080:80 fr-foundry
FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html
EXPOSE 80
