FROM node:14

RUN mkdir -p /config
COPY wtfbackend.js /
COPY swagger.yml /
COPY package.json /
COPY default.json /config

# Needed for Puppeteer dependency
RUN apt-get update && apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
RUN npm install
#RUN npm install --save body-parser
#RUN npm install child_process
#RUN npm install express
#RUN npm install mssql
#RUN npm install --save swagger-ui-express
EXPOSE 8080

CMD [ "node" , "/wtfbackend.js" ]
