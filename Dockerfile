FROM europe-north1-docker.pkg.dev/cgr-nav/pull-through/nav.no/node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY dist /app/dist
EXPOSE 8089 8090
CMD ["dist/server.cjs"]
