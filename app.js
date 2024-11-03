const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // Cache TTL is 1 hour

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Home Route
app.get('/', (req, res) => {
  res.render('index', { error: null });
});

app.post('/games', async (req, res) => {
    let { steamid } = req.body;
    const steamApiKey = process.env.STEAM_API_KEY;
  
    // Generate a unique cache key based on the SteamID
    const cacheKey = `steam-games-${steamid}`;
  
    // Check if the data is already in the cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log("Serving from cache");
      return res.render('games', cachedData);
    }
  
    // Function to resolve Vanity URL to SteamID64
    const getSteamID64 = async (vanityURL) => {
      try {
        const response = await axios.get(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/`, {
          params: {
            key: steamApiKey,
            vanityurl: vanityURL
          }
        });
        return response.data.response.success === 1 ? response.data.response.steamid : null;
      } catch (error) {
        console.error('Error resolving Vanity URL:', error);
        return null;
      }
    };
  
    // Check if input is SteamID64; if not, resolve Vanity URL
    if (!/^\d{17}$/.test(steamid)) {
      steamid = await getSteamID64(steamid);
      if (!steamid) return res.render('index', { error: 'Invalid SteamID or Vanity URL.' });
    }
  
    const apiUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/`;
  
    try {
      const response = await axios.get(apiUrl, {
        params: {
          key: steamApiKey,
          steamid: steamid,
          include_appinfo: true,
          include_played_free_games: true,
          format: 'json'
        }
      });
  
      const games = response.data.response.games;
      const gameCount = games ? games.length : 0;
  
      if (!games) {
        return res.render('index', { error: 'No games found or profile is private.' });
      }
  
      // Sort games alphabetically by name by default
      games.sort((a, b) => a.name.localeCompare(b.name));
  
      // Function to fetch achievements for a single game
      const fetchAchievements = async (game) => {
        if (!game.has_community_visible_stats) return { achieved: 0, total: 0 };
  
        try {
          const achResponse = await axios.get(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/`, {
            params: {
              key: steamApiKey,
              steamid: steamid,
              appid: game.appid,
              l: 'en' // Language
            }
          });
  
          if (achResponse.data.playerstats && achResponse.data.playerstats.achievements) {
            const achievements = achResponse.data.playerstats.achievements;
            const total = achievements.length;
            const achieved = achievements.filter(ach => ach.achieved).length;
            return { achieved, total };
          } else {
            return { achieved: 0, total: 0 };
          }
        } catch (error) {
          console.error(`Error fetching achievements for appid ${game.appid}:`, error.message);
          return { achieved: 0, total: 0 };
        }
      };
  
      // Fetch achievements for all games in parallel with a limit to avoid overwhelming the API
      const limit = 5; // Number of concurrent requests
      const achievementsData = [];
      for (let i = 0; i < games.length; i += limit) {
        const batch = games.slice(i, i + limit);
        const promises = batch.map(game => fetchAchievements(game));
        const results = await Promise.all(promises);
        achievementsData.push(...results);
      }
  
      // Attach achievements data to games
      games.forEach((game, index) => {
        game.achievements_achieved = achievementsData[index].achieved;
        game.achievements_total = achievementsData[index].total;
      });
  
      // Prepare the data for rendering and cache it
      const renderData = { games, steamid, gameCount };
      cache.set(cacheKey, renderData); // Cache the response
  
      res.render('games', renderData);
    } catch (error) {
      console.error('Error fetching games:', error);
      res.render('index', { error: 'An error occurred while fetching your games.' });
    }
  });  

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
