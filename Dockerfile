# syntax=docker/dockerfile:1

# VITE_API_URL è baked-in nel bundle statico a build time (Vite legge
# import.meta.env.VITE_API_URL solo in fase di build, vedi
# src/app/services/httpClient.ts): per cambiarlo dopo il deploy serve
# ricostruire l'immagine, non basta riavviare il container.
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
