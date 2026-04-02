[![InterMediakt DsMedia](https://intermediakt.org/wp-content/uploads/2024/01/Official_trsp-1024x194.png)](https://intermediakt.org)
[![Node.js](https://img.shields.io/badge/Node.js-6DA55F?logo=node.js&logoColor=white)](https://nodejs.org/)

## Author
Created by [Charalambos Rentoumis](https://github.com/5skr0ll3r)

# Disclaimer
This tool is for educational purposes and should be used 
only in your own test environments or with permission from the site owner.
We are not responsible on how this tool will be used

# Visitor
Do you want to check if your website is casually vissited by bots without
any warnings going off in the security tool you rely on bot detection,
or maybe check the rules if they apply correctly,
**Visitor** is excactly the tool you need with **Visitor** you can test if your
website is protected against bots
Its features include: 
- Human like behaviour.
  - Mouse movements (and not only random but also with purpose either to click a button or hover over something interesting)
  - Scrolling the pages (either to find something clickable or to just seem like he is navigating)
  - Typing 
- Fake Browser Profile, History And Cookies
- Random User Agents and device sizes
- Ability to redirect through proxy
- Multithreaded to simulate either swarm of bots or DOS attack

# How to use
## Generate UserAgents
```sh
user@host:~/Desktop/Visitor$ node sources/user-agents.js #If not already generated
# Outputed in uas.json
```

Open client.js in a text editor and replace at the end the 
`const link = 'https://example.com';` 
With your websites link

## How to run:
```sh
user@host:~/Desktop/Visitor$ ls
assets    fake_history.js  package.json       profiles           run_bots.sh  uas.json
client.js  Documentation.md  logs             proxy.config.json  sources
user@host:~/Desktop/Visitor$ npm install #Will install all dependencies

# To run the bot once do:
user@host:~/Desktop/Visitor$ node client.js

# To run the multithreaded version do:
user@host:~/Desktop/Visitor$ chmod +x run_bots.sh 
user@host:~/Desktop/Visitor$ ./run_bots.sh 
```


## Dependencies:

| Module | Version |
|----------|------------|
| proxy-chain | ^2.7.1 |
| puppeteer | ^24.37.2 |
| puppeteer-core | ^24.37.2 |
| puppeteer-extra | ^3.3.6 |
| puppeteer-extra-plugin-stealth | ^2.11.2 |
| sqlite3 | ^5.0.2 |


## Files
`./`
- client.js
  - is the put together from "openning" the browser loading fake profile
  - browsing
  - random mouse movements (mimicking real human interaction)
  - speed typing variation
  - human like scrolling
- fake_history.js
  - generates fake profile
  - loads fake profile with fake history and cookies
- proxy.conf.json
  - holds proxy configuration values
- run_bots.sh
  - Bash script that executes the client script 
  - multithreaded
  - adjustable speeds and max threads
- uas.json
  - JSON data organized by `/sources/user-agents.js` for random user-agent generation


`/sources/`
- search_queries.txt
  - contains specifically selected strings, line seperated that are used as a search query through google or any search engine
- user-agents.js
  - generates a json file `uas.json` using the data from `user-agents.txt`, which is used later in the process to select a random User-Agent
- usernames.txt
  - is a list of random usenames used later to create fake browser profiles

`/profiles/`
Here all the fake profiles will be stored as well as their fake history files

`/logs/`
Here all the logs for each thread running are stored

`/assets/`
Contains screeshots taken though out the process
