FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ARG VITE_FAMILY_API
ARG VITE_SCHEME_API
ARG VITE_CITIZEN_PORTAL
ENV VITE_FAMILY_API=$VITE_FAMILY_API
ENV VITE_SCHEME_API=$VITE_SCHEME_API
ENV VITE_CITIZEN_PORTAL=$VITE_CITIZEN_PORTAL
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
