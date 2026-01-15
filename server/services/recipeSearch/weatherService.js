const fetch = global.fetch || require("node-fetch");

// Simple weather fetch via open-meteo (no API key required)
// Requires coordinates. Set WEATHER_LAT / WEATHER_LON in .env
async function getCurrentWeather() {
  const lat = process.env.WEATHER_LAT;
  const lon = process.env.WEATHER_LON;
  if (!lat || !lon) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const cur = data?.current;
    if (!cur) return null;
    return {
      temperature: cur.temperature_2m,
      weather_code: cur.weather_code,
    };
  } catch (err) {
    console.warn("⚠️ Weather fetch failed:", err.message);
    return null;
  }
}

module.exports = {
  getCurrentWeather,
};
