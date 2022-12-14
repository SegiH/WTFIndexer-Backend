// TODO:Make all responses an array with ok or error

'use strict';

const bodyParser = require("body-parser");
const config = require("config");
const cors = require("cors");
const express = require('express');
const app = express();
const exec = require('child_process').exec;
const fs = require('fs');
const glob = require('glob');
const puppeteer = require('puppeteer');
const sql = require('mssql');
const swaggerUI = require("swagger-ui-express");
const url = require('url');
//const yaml = require("yamljs");
const swaggerJSDoc = require('swagger-jsdoc');

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';
const WTFPATH = '/WTF/';
const WTFARCHIVEPATH = '/WTF/Other/';
//const swaggerDocument = yaml.load("./swagger.yml");
const debugging=false; // Set to true to see console.log messages

if (!config.has("DB.Username") || !config.has("DB.Password") || !config.has("DB.Host") || !config.has("DB.Database")) {
     console.log("Error! One or more of the database connection parameters is missing. Check config/default.json");
     process.exit(1);
}

var connectionParams = {
     user: config.get("DB.Username"),
     password: config.get("DB.Password"),
     server: config.get("DB.Host"),
     database: config.get("DB.Database"),
     trustServerCertificate: true,
     pool: {
         max: 100,
         min: 0,
         idleTimeoutMillis: 30000
    }
};

const pool = new sql.ConnectionPool(connectionParams);

// Validate DB connection
if (!debugging) {
     (async () => {
          try {
               //const connection = await sql.connect(connectionParams);
               await pool.connect();
          } catch(err) {
               const errorMsg=`An error occurred connecting to the database with the error ${err}`;
               console.log(errorMsg);
               process.exit(1);
          }
     })();
}

app.use(bodyParser.urlencoded({extended: false}));
app.use(cors());

// Swagger definition
const swaggerOptions = {  
    swaggerDefinition: {
		openapi: '3.0.1',
        info: {  
            title:'WTF Backend',
            description: 'WTF Backend',
            version:'2.0.0'  
        },
		components: {
			schemas: {
				WTFEpisodes: {
					required: [
						"EpisodeID"
					],
					properties: {
						EpisodeID: {
							type: "integer"
						},
						EpisodeNumber: {
							type: "integer"
						},
						Name: {
							type: "string"
						},
						Description: {
							type: "string"
						},
						ReleaseDate: {
							type: "string"
						},
						Favorite: {
							type: "integer"
						}
					}
				},
				IMDB: {
					required: [
						"ID",
						"Name"
					],
					properties: {
						ID: {
							type: "integer"
						},
						Name: {
							type: "string"
						}
					}
				}
			},
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                }
            }
        },
        security: [{
          bearerAuth: []
        }],
		servers: [
        {
             url: 'http://localhost:8080',
             description: 'Development server',
        },
		{
             url: 'https://wtf-backend.hovav.org',
             description: 'Development server',
        },
        ],
		tags: [
		{
			name: 'WTFEpisodes',
			description: 'List of all WTF episodes'
		},
		{
			name: 'IMDB',
			description: 'DB with individual IMDB links'
		}
		]
    },  
    apis:['wtfbackend.js'],  
}

const swaggerDocs = swaggerJSDoc(swaggerOptions);
app.use('/swagger', swaggerUI.serve, swaggerUI.setup(swaggerDocs));

// Middleware that is called before any endpoint is reached
app.use(function (req, res, next) {
          console.log(req.url);

          if (req.url.startsWith("/AddIMDB"))
               next();
	  else if (!config.has(`Authorization`) || (config.has(`Authorization`) && config.get(`Authorization`) === "")) {
	       res.status(403).send('Error! authorization is not set in app.config.json');
	       res.end();
	  } else {
	      const AUTH_KEY=config.get(`Authorization`);
	 
              const bearerHeader=(typeof req.headers['authorization'] !== 'undefined' ? req.headers['authorization'].replace("Bearer ","") : null);

              if (bearerHeader === null || AUTH_KEY == null || (bearerHeader != null && bearerHeader != AUTH_KEY)) {
                   return res.status(403).send('Unauthorized');
	           res.end();
	      } else //Carry on with the request chain
                   next();
	 }
});

//Default route doesn't need to return anything 
app.get('/', (req, res) => {
     res.sendStatus(403);
});

/** 
 * @swagger 
 * /AddIMDB: 
 *    get:
 *        tags: 
 *          - IMDB
 *        summary: Add IMDB link
 *        description: Adde IMDB link
 *        parameters:
 *           - name: Name
 *             in: query
 *             description: Name to add
 *             required: true
 *             schema:
 *                  type: string
 *           - name: URL
 *             in: query
 *             description: URL add
 *             required: true
 *             schema:
 *                  type: string
 *        responses:  
 *          200: 
 *            description: '["OK",""] on success, ["ERROR","error message"] on error'
 *   
 */
app.get('/AddIMDB', (req, res) => {
     const name=(typeof req.query.Name !== 'undefined' ? req.query.Name : null);
     const URL=(typeof req.query.URL !== 'undefined' ? req.query.URL : null);

     if (name === null) {
          res.send(["ERROR","Name was not provided"]);
          return;
     }

     if (URL === null) {
          res.send(["ERROR","URL was not provided"]);
          return;
     }

     const params=[['Name',sql.VarChar,name],['URL',sql.VarChar,URL]];
     const SQL=`IF (SELECT COUNT(*) FROM IMDB WHERE IMDBURL=@URL) = 0 INSERT INTO IMDB(Name,IMDBURL) VALUES (@Name,@URL);`;
 
     execSQL(res,SQL,params,false);
});

/** 
 * @swagger 
 * /CheckInOut: 
 *    get:
 *        tags: 
 *          - WTFEpisodes
 *        summary: Check an episode in or out
 *        description: Check an episode in or out
 *        parameters:
 *           - name: EpisodeNumber
 *             in: query
 *             description: Episode Number
 *             required: true
 *             schema:
 *                  type: integer
 *           - name: IsCheckedOut
 *             in: query
 *             description: true or false
 *             required: true
 *             schema:
 *                  type: string
 *        responses:  
 *          200: 
 *            description: '["OK",CHECKOUT_STATUS] on success where CHECKOUT_STATUS is true or false, ["ERROR","error message"] on error'
 *   
 */
app.get('/CheckInOut', (req, res) => {
     const episodeNumber=(typeof req.query.EpisodeNum !== 'undefined' ? req.query.EpisodeNum : null);

     // 0 to check out an episode, 1 to check it in
     const isCheckedOutParam=(typeof req.query.IsCheckedOut !== 'undefined' ? req.query.IsCheckedOut : null);
 
     if (episodeNumber === null) {
          res.send(["ERROR",'Episode Number was not provided in /CheckInOut']);
	  return;
     }
 
     if (isCheckedOutParam === null) {
          res.send(["ERROR",'IsCheckedOut was not provided in /CheckInOut']);
	  return;
     }

     const isCheckedOut = parseInt(isCheckedOutParam);
	 
     if (isCheckedOut !== 0 && isCheckedOut !== 1) {
          res.send(["ERROR",`IsCheckedOut value *${isCheckedOut}* is not valid in /CheckInOut`]);
	  return;
     }

     const cmd = `mv ${(isCheckedOut ? WTFPATH : WTFARCHIVEPATH )}${episodeNumber}*.* ${(isCheckedOut ? WTFARCHIVEPATH : WTFPATH )} `;
   
     exec(cmd, (error, stdout, stderr) => {
          if (error) {
               res.send(["ERROR",`An error occurred executing the cmd ${cmd} with the error ${error}`]);
               return;
          }

          if (stderr) {
               res.send(["ERROR",`A std error occurred executing the cmd ${cmd} with the error ${error}`]);
               return;
          }

          // check success status here
          const file_exists=glob(`${(isCheckedOut ? WTFARCHIVEPATH : WTFPATH )}${episodeNumber}*.mp3`,function (err, files) {
 
               if (err) {
                    res.send(["ERROR",`An error occurred validating if the move succeeded with the error ${err}`]);
               } else {
                    res.send(["OK",!isCheckedOut]);
               }
          });
     });
});

/** 
 * @swagger 
 * /GetEpisodes: 
 *    get:
 *        tags: 
 *          - WTFEpisodes
 *        summary: Get all episodes
 *        description: Get all episodes
 *        parameters:
 *           - name: FavoritesOnly
 *             in: query
 *             description: Favorites only boolean value
 *             required: false
 *             schema:
 *                  type: integer
 *           - name: RecordCount
 *             in: query
 *             description: Limits how many records are retrieved. Defaults to 50 if not provided
 *             required: false
 *             schema:
 *                  type: integer
 *        responses:  
 *          200: 
 *            description: 'JSON object with all episodes on success, ["ERROR","error message"] on error'
 *   
 */
app.get('/GetEpisodes', (req, res) => {
     const favoritesOnly=(typeof req.query.FavoritesOnly !== 'undefined' ? req.query.FavoritesOnly : null);
     const recordCount=(typeof req.query.RecordCount !== 'undefined' ? req.query.RecordCount : 50);

     if (favoritesOnly !== null && favoritesOnly !== "0" && favoritesOnly !== "1") {
          res.send(["ERROR","Favorites must be 0 or 1"]);
          return;
     }

     const favoriteValue=parseInt(favoritesOnly);

     try {
          parseInt(recordCount);
     } catch(e) {
          res.send(["ERROR","RecordLimit must be a number"]);
          return;
     }

     const sql=`SELECT TOP(${recordCount}) *,dbo.ParseNames(Name) AS IMDBLink FROM WTFEpisodes ${(favoritesOnly !== null ? `WHERE Favorite=${favoriteValue}` : ``)} ORDER BY EpisodeID DESC`;

     execSQL(res,sql,{},true);
});

/** 
 * @swagger 
 * /GetEpisodeCheckInOutStatus: 
 *    get:
 *        tags: 
 *          - WTFEpisodes
 *        summary: Get check in/out status for all episodes
 *        description: Get check in/out status for all episodes
 *        responses:  
 *          200: 
 *            description: 'JSON object with all episode numbers and checkout status for each on success, ["ERROR","error message"] on error'
 *   
 */
app.get('/GetEpisodeCheckInOutStatus', (req, res) => {
     const request = pool.request();
   
     request.execute('GetEpisodeCheckInOutStatus', function(err, recordsets, returnValue) {
          // ... error checks
          res.send(recordsets.recordset);
    });
});

/** 
 * @swagger 
 * /GetIMDBNames: 
 *    get:
 *        tags: 
 *          - IMDB
 *        summary: Get all IMDB links
 *        description: Get all IMDB links
 *        responses:  
 *          200: 
 *            description: 'JSON object with all IMDB links'
 *   
 */
app.get('/GetIMDBNames', (req, res) => {
     const sql=`SELECT * FROM IMDB ORDER BY Name`;

     execSQL(res,sql,{},true);
});

/** 
 * @swagger 
 * /ScrapeData: 
 *    put:
 *        tags: 
 *          - IMDB
 *        summary: Scrape WTF podcast page for new episode data
 *        description: Scrape WTF podcast page for new episode data
 *        responses:  
 *          200: 
 *            description: '"" on success, "error message" on error'
 *   
 */
app.put('/ScrapeData', async (req, res) => {
	 const startingEpisodeNum=(typeof req.query.StartingEpisodeNum !== 'undefined' ? req.query.StartingEpisodeNum : null);
	 
	 if (startingEpisodeNum === null) {
		  res.send(["ERROR","Starting episode number was not provided"]);
		  return;
	 }

         const newEpisodes=await scrapeEpisodes(startingEpisodeNum);

	 for (const episode of newEpisodes) {
		 const params=[['EpisodeNum',sql.VarChar,episode.EpisodeNum],['Name',sql.VarChar,episode.Name],['Description',sql.VarChar,episode.Description],['ReleaseDate',sql.VarChar,episode.Date],["DownloadLink",sql.VarChar,episode.DownloadLink]];
		 const SQL=`IF (SELECT COUNT(*) FROM WTFEpisodes WHERE EpisodeNum=@EpisodeNum)=0 INSERT INTO WTFEpisodes(EpisodeNum,Name,Description,ReleaseDate,Favorite,DownloadLink) VALUES (@EpisodeNum,@Name,@Description,@ReleaseDate,0,@DownloadLink);` + (typeof episode.Description === 'string' &&episode.Description !== null ? `ELSE UPDATE WTFEpisodes SET DownloadLink=@DownloadLink WHERE EpisodeNum=@EpisodeNum` : ``);

		 execSQL(res,SQL,params,true,true);
	 }
	 
	 res.send(["OK",""]);
});

/** 
 * @swagger 
 * /UpdateEpisodes: 
 *    put:
 *        tags: 
 *          - WTFEpisodes
 *        summary: Updates the name for a given episode
 *        description: Updates the name for a given episode
 *        parameters:
 *           - name: EpisodeID
 *             in: query
 *             description: Episode ID
 *             required: true
 *             schema:
 *                  type: integer
 *           - name: EpisodeNum
 *             in: query
 *             description: Episode Num
 *             required: false
 *             schema:
 *                  type: integer
 *           - name: Name
 *             in: query
 *             description: Name
 *             required: false
 *             schema:
 *                  type: string
 *           - name: Description
 *             in: query
 *             description: Description
 *             required: false
 *             schema:
 *                  type: string
 *           - name: ReleaseDate
 *             in: query
 *             description: Release Date
 *             required: false
 *             schema:
 *                  type: string
 *           - name: Favorite
 *             in: query
 *             description: Favorite
 *             required: false
 *             schema:
 *                  type: string
 *        responses:  
 *          200: 
 *            description: '["OK",""] on success, ["ERROR","error message"] on error'
 *   
 */
app.put('/UpdateEpisodes', (req, res) => {
     const episodeID=(typeof req.query.EpisodeID !== 'undefined' ? req.query.EpisodeID : null);
	 const episodeNumber=(typeof req.query.EpisodeNum !== 'undefined' ? req.query.EpisodeNum : null);
	 const name=(typeof req.query.Name !== 'undefined' ? req.query.Name : null);
	 const description=(typeof req.query.Description !== 'undefined' ? req.query.Description : null);
	 const releaseDate=(typeof req.query.ReleaseDate !== 'undefined' ? req.query.ReleaseDate : null);
	 const favorite=(typeof req.query.Favorite !== 'undefined' ? req.query.Favorite : null);
     
	 if (episodeID === null) {
		  res.send(["ERROR","Episode ID was not provided"]);
		  return;
	 }
	 
	 let params=[];
     let updateStr="";
	 
	 if (episodeNumber !== null) {
		  params.push(['EpisodeNum',sql.Int,episodeNum]);
		  updateStr="EpisodeNum=@EpisodeNum";
	 }
	 
	 if (name != null) {
		  params.push(['Name',sql.VarChar,name]);
		  updateStr+=(updateStr != "" ? "," : "") + "Name=@Name";
	 }
	 
	 if (description) {
		  params.push(['Description',sql.VarChar,description]);
		  updateStr+=(updateStr != "" ? "," : "") + "Description=@Description";
	 }
	 
	 if (releaseDate) {
		  params.push(['ReleaseDate',sql.VarChar,releaseDate]);
                  updateStr+=(updateStr != "" ? "," : "") + " ReleaseDate=@ReleaseDate";
	 }
	 
	 if (favorite) {
		  params.push(['Favorite',sql.Int,favorite]);
		  updateStr+=(updateStr != "" ? "," : "") + "Favorite=@Favorite";
	 }
	 
	 if (params.length === 0) {
	          res.send(["ERROR",`Please specify at least one column to update. No columns were updated when episode ID=${episodeID}`]);
		  return;
     }
	 
	 params.push(['EpisodeID',sql.Int,episodeID]);
	 
	 const SQL=`BEGIN TRANSACTION; UPDATE TOP(1) WTFEpisodes SET ${updateStr} WHERE EpisodeID=@EpisodeID; COMMIT;`;
	 
	 execSQL(res,SQL,params);
});

/** 
 * @swagger 
 * /UpdateFavorite: 
 *    put:
 *        tags: 
 *          - WTFEpisodes
 *        summary: Updates the favorite for a given episode
 *        description: Updates the favorite for a given episode
 *        parameters:
 *           - name: FavoritesValue
 *             in: query
 *             description: Favorites only boolean value
 *             required: false
 *             schema:
 *                  type: string
 *        responses:  
 *          200: 
 *            description: '["OK",""] on success, ["ERROR","error message"] on error'
 *   
 */
app.put('/UpdateFavorite', (req, res) => {
	 const epNum=(typeof req.query.EpisodeNum !== 'undefined' ? req.query.EpisodeNum : null);
	 const favoriteStatus=(typeof req.query.FavoriteValue !== 'undefined' && req.query.FavoriteValue === "true" ? 1 : 0);
	 
	 if (epNum === null) {
		  res.send("Episode number was not provided");
	 } else {
	      const sql=`UPDATE WTFEpisodes SET Favorite=${favoriteStatus} WHERE EpisodeNum=${epNum};`;

	      execSQL(res,sql,{});
     }
});

/** 
 * @swagger 
 * /UpdateIMDB: 
 *    put:
 *        tags: 
 *          - IMDB
 *        summary: Update IMDB link
 *        description: Update IMDB link
 *        parameters:
 *           - name: ID
 *             in: query
 *             description: ID of link to update
 *             required: false
 *             schema:
 *                  type: integer
 *           - name: Name
 *             in: query
 *             description: Name to update
 *             required: true
 *             schema:
 *                  type: string
 *           - name: URL
 *             in: query
 *             description: URL update
 *             required: true
 *             schema:
 *                  type: string
 *        responses:  
 *          200: 
 *            description: '["OK",""] on success, ["ERROR","error message"] on error'
 *   
 */
app.put('/UpdateIMDB', (req, res) => {
     const ID=(typeof req.query.ID !== 'undefined' ? req.query.ID : null);
     const name=(typeof req.query.Name !== 'undefined' ? req.query.Name : null);
     const URL=(typeof req.query.URL !== 'undefined' ? req.query.URL : null);

     if (name === null) {
          res.send(["ERROR","Name was not provided"]);
          return;
     }

     if (URL === null) {
          res.send(["ERROR","URL was not provided"]);
          return;
     }

     const params=[['Name',sql.VarChar,name],['URL',sql.VarChar,URL],['IMDBID',sql.Int,ID]];
     const SQL=(ID === null ? `IF (SELECT COUNT(*) FROM IMDB WHERE IMDBURL=@URL) = 0 INSERT INTO IMDB(Name,IMDBURL) VALUES (@Name,@URL);` : `UPDATE IMDB SET Name=@Name,IMDBURL=@URL WHERE IMDBID=@IMDBID`);
 
     execSQL(res,SQL,params,false);
});

async function execSQL(res, SQL, params, isQuery,returnData) {
     try {
          let data = pool.request();

          for (let i=0;i<params.length;i++){
               data.input(params[i][0],params[i][1],params[i][2]);
          }

          const result = await data.query(SQL);
		  
          if (isQuery)
	           if (returnData)
	                return result.recordset;
               else
		            res.send(result.recordset);
          else
               res.send(["OK",""]);
     } catch(e) {
          console.log(`An error occurred executing the SQL ${SQL} with the error ${e} and the params ${params}`);
     }
}

async function scrapeEpisodes(startingEpisodeNum) {
     const browser = await puppeteer.launch({dumpio: debugging, args: ['--no-sandbox', '--disable-setuid-sandbox']});
     const URL = 'http://www.wtfpod.com/podcast';
     const page = await browser.newPage();

     await page.goto(URL);

     // This will allow the code block inside of page.evaluate() to get access to the value of startingEpisodeNum;
     await page.exposeFunction("getStartingEpisodeNum", function() {
          return startingEpisodeNum;
     });

     // Every call to loadMoreButton() immediately invokes the simulated click on the "More Episodes" button
     await page.exposeFunction("loadMoreButton", function() {
          return page.$eval(`a.more-episodes-btn`, element =>
               element.click()
          ),
	      page.waitForTimeout(500);
     });

     const episodes = await page.evaluate(async () => {
          const startingEpisodeNum=await getStartingEpisodeNum();
          const splitDelimiter=" - ";
          const episodes = [];

          let items = document.querySelectorAll(".entry-inner");

          // If needed, simulate clicking on load button to load more items so all episodes can be loaded into the DOM
          while (true) {
               const oldestItem=items[items.length-1];
               const oldestEpisodeNumEl=oldestItem.querySelector(".entry-title").textContent;
	       const oldestEpisodeNum=oldestEpisodeNumEl.split(splitDelimiter)[0].trim().replace("Episode ","");

               if (oldestEpisodeNum === "Repost" || (oldestEpisodeNum !== "Repost" && parseInt(oldestEpisodeNum) > startingEpisodeNum)) {
                    await loadMoreButton();
                    items = document.querySelectorAll(".entry-inner");
               } else {
                   break;
               }
          }

          for (const item of items) {
	       // Most episode titles are in the format "Episode 1300 - John Doe". Some episode titles do not have the episode number in them (e.g. "Repost - Remembering John Doe")
	       const nameEpisodeElement=item.querySelector(".entry-title").textContent;

	       if (nameEpisodeElement.split(splitDelimiter).length === 2) {
                    const episodeNum=item.querySelector(".entry-title").textContent.split(splitDelimiter)[0].trim().replace("Episode ","");
                    const name=item.querySelector(".entry-title").textContent.split(splitDelimiter)[1].trim();
                    const date=item.querySelector(".entry-date").textContent.trim();

                    // Needed to get description
                    const moreLink=item.querySelector("a.more-link").href;

                    if (episodeNum !== "Repost" && parseInt(episodeNum) >= startingEpisodeNum) { // Ignore repost episodes
                         episodes.push({
                              EpisodeNum: episodeNum,
                              Name: name,
                              Date: date,
                              MoreLink: moreLink,
                         });
                    }
	       }
          }

          return episodes;
     })

     for (const episode of episodes) {
          await page.goto(episode.MoreLink);

          const description = await page.evaluate(browser => {
               try {
                    const items = document.querySelectorAll(".entry-content");

                    const entryTitle=items[0].querySelector(".sqs-block-content").textContent;

	            return entryTitle;
               } catch(err) {
                    return "";
               }
          });

	  episode["Description"]=description.trim();

          const downloadLink = await page.evaluate(browser => {
               try { 
                    const items = document.querySelectorAll(".entry-content");

                    if (items.length === 1) { 
                         const entryDownloadLink=items[0].querySelector(".sqs-audio-embed").getAttribute('data-url');

	                 return entryDownloadLink;
                    }
               } catch(e) {
                   console.log(`Returning empty description`);
               }
          });
         
          if (typeof downloadLink !== 'undefined')
	       episode["DownloadLink"]=downloadLink.trim();
     }

     browser.close();

     return episodes;
}

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);
