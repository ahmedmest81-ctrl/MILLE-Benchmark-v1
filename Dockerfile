FROM node:24-slim

USER node
ENV HOME=/home/node \
    PORT=7860 \
    HOST=0.0.0.0

WORKDIR $HOME/app
COPY --chown=node:node . $HOME/app

EXPOSE 7860
CMD ["node", "static-server.mjs"]
