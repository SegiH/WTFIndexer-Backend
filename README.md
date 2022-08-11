# WTF-Indexer Backend

WTF-Indexer Backend is the backend service written in Node JS that the application WTF-Indexer communicates with.

## Installation
1. Edit config\default.json
   - Update the database configuration and update username, password, host and database
   - Set the authorization. This is the JWT token that has to be passed from WTFIndexer in order to authorize the backend
1. To install in Docker
   - Edit wtfbackend-compose.yml 
   - Change YourNetworkName to your Docker network name. 
   - If you want to be able to check podcast episodes in and out and have the podcast episodes, mount the path to the    episodes as a volume. Otherwise delete the volume section
   - Install the compose file `docker-compose -f wtfbackend-compose.yml up -d`
1. Non-Docker installation
   - Run 'node wtfbackend.js'