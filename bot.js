const http = require("http");
http.createServer((req, res) => res.end("ok")).listen(process.env.PORT || 3000);

// Keep-alive ping to prevent Render from spinning down after inactivity
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(() => {
    fetch(RENDER_URL).catch((err) => console.error("Keep-alive ping failed:", err));
  }, 30_000);
}
require('dotenv').config({ path: 'token.env' });
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const YR_USER_AGENT = "SunnyBot/1.0 m.thomsen96@outlook.com"; // <-- Update this

// Sunny symbol codes from MET/Yr
const SUNNY_CODES = [
  "clearsky_day",
  "clearsky_night",
  "clearsky_polartwilight",
  "fair_day",
  "fair_night",
  "fair_polartwilight",
];

// Map symbol codes to emoji
const SYMBOL_EMOJI = {
  clearsky_day: "☀️",
  clearsky_night: "🌙",
  clearsky_polartwilight: "🌅",
  fair_day: "🌤️",
  fair_night: "🌙",
  fair_polartwilight: "🌄",
};

// Named locations (name → lat/lon)
const LOCATIONS = {
  oslo: { lat: 59.9139, lon: 10.7522, name: "Oslo" },
  bergen: { lat: 60.3913, lon: 5.3221, name: "Bergen" },
  trondheim: { lat: 63.4305, lon: 10.3951, name: "Trondheim" },
  stavanger: { lat: 58.9701, lon: 5.7331, name: "Stavanger" },
  kristiansand: { lat: 58.1599, lon: 8.0182, name: "Kristiansand" },
  tromsø: { lat: 69.6496, lon: 18.9553, name: "Tromsø" },
  london: { lat: 51.5, lon: 0.0, name: "London" },
  paris: { lat: 48.8566, lon: 2.3522, name: "Paris" },
  berlin: { lat: 52.52, lon: 13.405, name: "Berlin" },
  madrid: { lat: 40.4168, lon: -3.7038, name: "Madrid" },
  rome: { lat: 41.9028, lon: 12.4964, name: "Rome" },
  amsterdam: { lat: 52.3676, lon: 4.9041, name: "Amsterdam" },
  stockholm: { lat: 59.3293, lon: 18.0686, name: "Stockholm" },
  copenhagen: { lat: 55.6761, lon: 12.5683, name: "Copenhagen" },
  helsinki: { lat: 60.1699, lon: 24.9384, name: "Helsinki" },
  reykjavik: { lat: 64.1355, lon: -21.8954, name: "Reykjavik" },
  new_york: { lat: 40.7128, lon: -74.006, name: "New York" },
  los_angeles: { lat: 34.0522, lon: -118.2437, name: "Los Angeles" },
  tokyo: { lat: 35.6762, lon: 139.6503, name: "Tokyo" },
  sydney: { lat: -33.8688, lon: 151.2093, name: "Sydney" },
};

async function getWeather(lat, lon) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const res = await fetch(url, {
    headers: { "User-Agent": YR_USER_AGENT },
  });
  if (!res.ok) throw new Error(`Yr API error: ${res.status}`);
  return res.json();
}

function isSunny(symbolCode) {
  return SUNNY_CODES.includes(symbolCode);
}

function formatTemperature(temp) {
  return `${Math.round(temp)}°C`;
}

function buildSunnyEmbed(locationName, timeseries) {
  const now = timeseries[0];
  const symbol = now.data?.next_1_hours?.summary?.symbol_code || "unknown";
  const temp = now.data?.instant?.details?.air_temperature;
  const wind = now.data?.instant?.details?.wind_speed;
  const humidity = now.data?.instant?.details?.relative_humidity;
  const emoji = SYMBOL_EMOJI[symbol] || "☀️";

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`${emoji} It's sunny in ${locationName}!`)
    .setDescription(
      `Great news — clear skies ahead in **${locationName}**. Get outside! 🌞`
    )
    .addFields(
      {
        name: "🌡️ Temperature",
        value: formatTemperature(temp),
        inline: true,
      },
      {
        name: "💨 Wind",
        value: `${Math.round(wind)} m/s`,
        inline: true,
      },
      {
        name: "💧 Humidity",
        value: `${Math.round(humidity)}%`,
        inline: true,
      },
      {
        name: "🌤️ Condition",
        value: symbol.replace(/_/g, " "),
        inline: true,
      }
    )
    .setFooter({ text: "Powered by Yr / MET Norway • yr.no" })
    .setTimestamp();

  return embed;
}

function buildNotSunnyEmbed(locationName, timeseries) {
  const now = timeseries[0];
  const symbol =
    now.data?.next_1_hours?.summary?.symbol_code ||
    now.data?.next_6_hours?.summary?.symbol_code ||
    "unknown";
  const temp = now.data?.instant?.details?.air_temperature;

  // Look ahead for next sunny period
  let nextSunny = null;
  for (const entry of timeseries.slice(1, 48)) {
    const s =
      entry.data?.next_1_hours?.summary?.symbol_code ||
      entry.data?.next_6_hours?.summary?.symbol_code;
    if (s && isSunny(s)) {
      nextSunny = entry;
      break;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x5b8dee)
    .setTitle(`⛅ Not sunny in ${locationName} right now`)
    .setDescription(
      `Current conditions in **${locationName}**: ${symbol.replace(/_/g, " ")} at ${formatTemperature(temp)}.`
    )
    .setFooter({ text: "Powered by Yr / MET Norway • yr.no" })
    .setTimestamp();

  if (nextSunny) {
    const date = new Date(nextSunny.time);
    const timeStr = date.toLocaleString("en-GB", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const nextSymbol =
      nextSunny.data?.next_1_hours?.summary?.symbol_code ||
      nextSunny.data?.next_6_hours?.summary?.symbol_code;
    embed.addFields({
      name: "☀️ Next sunny period",
      value: `${SYMBOL_EMOJI[nextSymbol] || "☀️"} ${timeStr}`,
    });
  } else {
    embed.addFields({
      name: "☀️ Next sunny period",
      value: "No sunny weather in the next 48 hours 😔",
    });
  }

  return embed;
}

// ── Commands ──────────────────────────────────────────────────────────────────

// !sunny <city>
// !sunny lat=<lat> lon=<lon>
// !sunnycheck - check all preset locations

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();

  // !sunny
  if (content.startsWith("!sunny")) {
    const args = content.slice("!sunny".length).trim();

    let lat, lon, locationName;

    if (!args) {
      return message.reply(
        "**Usage:**\n`!sunny <city>` — e.g. `!sunny oslo`\n`!sunny lat=59.91 lon=10.75` — custom coordinates\n\n**Available cities:** " +
          Object.keys(LOCATIONS).join(", ")
      );
    }

    // lat/lon mode
    const latMatch = args.match(/lat=([\d.\-]+)/i);
    const lonMatch = args.match(/lon=([\d.\-]+)/i);
    if (latMatch && lonMatch) {
      lat = parseFloat(latMatch[1]);
      lon = parseFloat(lonMatch[1]);
      locationName = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } else {
      // Named city
      const key = args.toLowerCase().replace(/\s+/g, "_");
      const loc = LOCATIONS[key];
      if (!loc) {
        return message.reply(
          `Unknown city **${args}**. Try one of: ${Object.keys(LOCATIONS).join(", ")}\nOr use: \`!sunny lat=<lat> lon=<lon>\``
        );
      }
      lat = loc.lat;
      lon = loc.lon;
      locationName = loc.name;
    }

    try {
      await message.channel.sendTyping();
      const data = await getWeather(lat, lon);
      const timeseries = data.properties.timeseries;
      const symbol =
        timeseries[0].data?.next_1_hours?.summary?.symbol_code ||
        timeseries[0].data?.next_6_hours?.summary?.symbol_code ||
        "";

      const embed = isSunny(symbol)
        ? buildSunnyEmbed(locationName, timeseries)
        : buildNotSunnyEmbed(locationName, timeseries);

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Could not fetch weather data. Please try again.");
    }
  }

  // !sunwatch — posts when it becomes sunny (checks every hour)
  if (content.startsWith("!sunwatch")) {
    const args = content.slice("!sunwatch".length).trim();
    if (!args) {
      return message.reply(
        "Usage: `!sunwatch <city>` — I'll ping this channel when it gets sunny!\nAvailable cities: " +
          Object.keys(LOCATIONS).join(", ")
      );
    }

    const key = args.toLowerCase().replace(/\s+/g, "_");
    const loc = LOCATIONS[key];
    if (!loc) {
      return message.reply(
        `Unknown city **${args}**. Available: ${Object.keys(LOCATIONS).join(", ")}`
      );
    }

    message.reply(
      `👁️ Watching the sky over **${loc.name}**! I'll ping you here when it gets sunny ☀️`
    );

    let wasNotSunny = true;
    const interval = setInterval(async () => {
      try {
        const data = await getWeather(loc.lat, loc.lon);
        const ts = data.properties.timeseries;
        const symbol =
          ts[0].data?.next_1_hours?.summary?.symbol_code ||
          ts[0].data?.next_6_hours?.summary?.symbol_code ||
          "";

        if (isSunny(symbol) && wasNotSunny) {
          wasNotSunny = false;
          const embed = buildSunnyEmbed(loc.name, ts);
          message.channel.send({
            content: `${message.author} ☀️ It's now sunny in **${loc.name}**!`,
            embeds: [embed],
          });
        } else if (!isSunny(symbol)) {
          wasNotSunny = true;
        }
      } catch (e) {
        console.error("sunwatch error:", e);
      }
    }, 60 * 60 * 1000); // check every hour

    // Stop after 24 hours
    setTimeout(() => {
      clearInterval(interval);
      message.channel.send(
        `⏰ Stopped watching **${loc.name}** after 24 hours. Use \`!sunwatch ${args}\` to restart.`
      );
    }, 24 * 60 * 60 * 1000);
  }

  // !help
  if (content === "!help" || content === "!sunnyhelp") {
    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("☀️ SunnyBot Commands")
      .addFields(
        {
          name: "`!sunny <city>`",
          value:
            "Check if it's currently sunny in a city.\nExample: `!sunny oslo`",
        },
        {
          name: "`!sunny lat=<lat> lon=<lon>`",
          value:
            "Check weather at custom coordinates.\nExample: `!sunny lat=59.91 lon=10.75`",
        },
        {
          name: "`!sunwatch <city>`",
          value:
            "Watch the sky and get pinged when it turns sunny (runs for 24h).\nExample: `!sunwatch bergen`",
        },
        {
          name: "Available cities",
          value: Object.keys(LOCATIONS).join(", "),
        }
      )
      .setFooter({ text: "Powered by Yr / MET Norway • yr.no" });

    message.reply({ embeds: [embed] });
  }
});

client.once("ready", () => {
  console.log(`✅ SunnyBot is online as ${client.user.tag}`);
  client.user.setActivity("☀️ the skies", { type: 3 }); // WATCHING
});

client.login(process.env.DISCORD_TOKEN);
