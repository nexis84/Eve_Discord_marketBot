import 'dotenv/config';
import { ReadableStream, WritableStream, TransformStream } from 'web-streams-polyfill/dist/polyfill.es2018.js';

// Polyfill for web streams if needed
if (!globalThis.ReadableStream) {
    globalThis.ReadableStream = ReadableStream;
}
if (!globalThis.WritableStream) {
    globalThis.WritableStream = WritableStream;
}
if (!globalThis.TransformStream) {
    globalThis.TransformStream = TransformStream;
}

import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';
import Bottleneck from 'bottleneck';
import express from 'express';

// Set up Express server for Cloud Run
const app = express();

// Set up rate limiter with Bottleneck
const limiter = new Bottleneck({
    minTime: 500, // 500ms between requests (2 requests per second)
    maxConcurrent: 1 // Only one request at a time
});

// Set up Discord bot client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) {
    console.error("Discord token is missing, exiting.");
    process.exit(1);
}

// Log in to Discord with your client's token
client.login(DISCORD_TOKEN);

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Set a default User Agent if one is not set in the environment variables.
const USER_AGENT = process.env.USER_AGENT || 'DiscordBot/1.0.0 (contact@example.com)';

// Cache for Type IDs
const typeIDCache = new Map();

const JITA_SYSTEM_ID = 30000142; // Jita system ID
const JITA_REGION_ID = 10000002; // The Forge Region ID

// Function to fetch market data for an item
async function fetchMarketData(itemName, typeID, channel, retryCount = 0) {
    try {
        console.log(`[fetchMarketData] Start: Fetching market data for ${itemName} (TypeID: ${typeID}), Retry: ${retryCount}`);
        return fetchMarketDataFromESI(itemName, typeID, channel, retryCount);
    } catch (error) {
        console.error(`[fetchMarketData] General Error: ${error.message}, Retry: ${retryCount}`);
        channel.send(`❌ Error fetching data for "${itemName}": ${error.message} ❌`);
    }
}

// Function to fetch market data from ESI API
async function fetchMarketDataFromESI(itemName, typeID, channel, retryCount = 0) {
    try {
        const sellOrdersURL = `https://esi.evetech.net/latest/markets/${JITA_REGION_ID}/orders/?datasource=tranquility&order_type=sell&type_id=${typeID}`;
        const buyOrdersURL = `https://esi.evetech.net/latest/markets/${JITA_REGION_ID}/orders/?datasource=tranquility&order_type=buy&type_id=${typeID}`;

        const [sellOrdersRes, buyOrdersRes] = await Promise.all([
            axios.get(sellOrdersURL, {
                headers: { 'User-Agent': USER_AGENT },
                validateStatus: (status) => status >= 200 && status < 500, // Accept status codes 200-499
            }),
            axios.get(buyOrdersURL, {
                headers: { 'User-Agent': USER_AGENT },
                validateStatus: (status) => status >= 200 && status < 500, // Accept status codes 200-499
            }),
        ]);

        if (sellOrdersRes.status !== 200) {
            console.error(`[fetchMarketDataFromESI] Error fetching sell orders. HTTP Status: ${sellOrdersRes.status}`);
            channel.send(`❌ Error fetching sell orders for "${itemName}": HTTP ${sellOrdersRes.status}. ❌`);
            return;
        }

        if (buyOrdersRes.status !== 200) {
            console.error(`[fetchMarketDataFromESI] Error fetching buy orders. HTTP Status: ${buyOrdersRes.status}`);
            channel.send(`❌ Error fetching buy orders for "${itemName}": HTTP ${buyOrdersRes.status}. ❌`);
            return;
        }

        const sellOrders = sellOrdersRes.data;
        const buyOrders = buyOrdersRes.data;

        if (!sellOrders || sellOrders.length === 0) {
            console.error(`[fetchMarketDataFromESI] No sell orders found for "${itemName}"`);
            channel.send(`❌ No sell orders for "${itemName}". ❌`);
            return;
        }

        if (!buyOrders || buyOrders.length === 0) {
            console.error(`[fetchMarketDataFromESI] No buy orders found for "${itemName}"`);
            channel.send(`❌ No buy orders for "${itemName}". ❌`);
            return;
        }

        // Find the lowest sell price and the highest buy price
        const lowestSellOrder = sellOrders.reduce((min, order) => (order.price < min.price ? order : min), sellOrders[0]);
        const highestBuyOrder = buyOrders.reduce((max, order) => (order.price > max.price ? order : max), buyOrders[0]);

        const sellPrice = parseFloat(lowestSellOrder.price).toLocaleString(undefined, { minimumFractionDigits: 2 });
        const buyPrice = parseFloat(highestBuyOrder.price).toLocaleString(undefined, { minimumFractionDigits: 2 });

        channel.send(`Sell: ${sellPrice} ISK, Buy: ${buyPrice} ISK`);
    } catch (error) {
        console.error(`[fetchMarketDataFromESI] Error fetching market data: ${error.message}`);
        channel.send(`❌ Error fetching market data for "${itemName}": ${error.message} ❌`);
    }
}

// Discord message event handler
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const prefix = '!';

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'market') {
        const itemName = args.join(' ').trim();

        if (!itemName) {
            message.channel.send('❌ Please specify an item to search for. ❌');
            return;
        }

        getItemTypeID(itemName)
            .then((typeID) => {
                if (typeID) {
                    fetchMarketData(itemName, typeID, message.channel);
                } else {
                    message.channel.send(`❌ No TypeID found for "${itemName}". ❌`);
                }
            })
            .catch((error) => {
                message.channel.send(`❌ Error fetching TypeID for "${itemName}": ${error.message} ❌`);
            });
    }
});

// Function to get the TypeID of an item based on its name
async function getItemTypeID(itemName) {
    if (typeIDCache.has(itemName)) {
        return typeIDCache.get(itemName);
    }

    try {
        const searchRes = await limiter.schedule(() => {
            return axios.get(`http://www.fuzzwork.co.uk/api/typeid.php?typename=${encodeURIComponent(itemName)}`, {
                headers: { 'User-Agent': USER_AGENT }
            });
        });

        if (searchRes.status !== 200) {
            console.error(`[getItemTypeID] Error fetching TypeID for "${itemName}": HTTP ${searchRes.status}`);
            return null;
        }

        const typeID = searchRes.data.trim();
        if (isNaN(parseInt(typeID))) {
            return null;
        }

        typeIDCache.set(itemName, parseInt(typeID, 10));
        return parseInt(typeID, 10);
    } catch (error) {
        console.error('[getItemTypeID] Error fetching TypeID:', error);
        return null;
    }
}

// Set up health check route for Cloud Run
app.get('/', (req, res) => {
    res.send('Eve Market Bot is running!');
});

// Set the server to listen on the appropriate port
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
