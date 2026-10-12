/**
 * YOUR AGENT'S TOOLS
 *
 * A tool is just a function the agent is allowed to call.
 * Gemini reads the `description` to decide WHEN to use it,
 * and `parameters` to know WHAT to pass in.
 *
 * Add your own tool: copy one of the objects below, change it,
 * and save. It shows up in the "Tools" list on the page.
 */
import { getWalletAddress, getWalletBalance, payAndFetch } from "./wallet";

export type Tool = {
  name: string;
  description: string;
  /** JSON Schema describing the inputs. */
  parameters: object;
  /** The code that runs when the agent calls this tool. */
  run: (args: any, ctx: { baseUrl: string }) => Promise<unknown>;
};

export const tools: Tool[] = [
  // ─── 1. A paid API: the agent's wallet signs a payment to unlock it ───
  {
    name: "get_weather",
    description: "Get the current weather for a city. Costs 0.01 USDC, paid automatically from the agent's wallet.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name, e.g. Mumbai" },
      },
      required: ["city"],
    },
    run: async ({ city }, { baseUrl }) => {
      return payAndFetch(`${baseUrl}/api/weather?city=${encodeURIComponent(city)}`);
    },
  },

  // ─── 2. Wallet tool: read the agent's own wallet ───
  {
    name: "get_my_wallet",
    description: "Get the agent's own wallet address and its ETH balance on Base Sepolia (testnet).",
    parameters: { type: "object", properties: {} },
    run: async () => ({
      address: getWalletAddress(),
      balance: await getWalletBalance(),
      network: "Base Sepolia (testnet)",
    }),
  },

  // ─── 3. A plain tool: no wallet, no API. Try changing this one first! ───
  {
    name: "roll_dice",
    description: "Roll a dice with the given number of sides.",
    parameters: {
      type: "object",
      properties: {
        sides: { type: "number", description: "How many sides the dice has. Default 6." },
      },
    },
    run: async ({ sides = 6 }) => ({ rolled: Math.floor(Math.random() * sides) + 1, sides }),
  },

  // ─── 4. Random joke: free public API, no inputs, no payment ───
  {
    name: "get_joke",
    description: "Get a random joke. Use when the user wants a joke.",
    parameters: {
      type: "object",
      properties: {},
    },
    run: async () => {
      const res = await fetch("https://official-joke-api.appspot.com/random_joke");
      if (!res.ok) throw new Error(`Joke API failed: ${res.status}`);
      return res.json();
    },
  },

  // ─── 5. Country info: free public API with an input ───
  // NOTE: the guide's restcountries.com/v3.1 is deprecated (returns
  // {"success":false...}), so we use countriesnow + worldbank instead.
  {
    name: "get_country_info",
    description: "Get facts about a country, including its capital and population.",
    parameters: {
      type: "object",
      properties: {
        country: {
          type: "string",
          description: "Country name, e.g. India",
        },
      },
      required: ["country"],
    },
    run: async ({ country }) => {
      // 1. Find capital + ISO code by name
      const capRes = await fetch("https://countriesnow.space/api/v0.1/countries/capital");
      if (!capRes.ok) throw new Error(`Capital API failed: ${capRes.status}`);
      const { data: list } = await capRes.json();
      const match = (list as any[]).find(
        (c) => c.name.toLowerCase() === String(country).toLowerCase()
      );
      if (!match) throw new Error(`Country not found: ${country}`);

      // 2. Enrich with region/population context from World Bank (no key needed)
      try {
        const wbRes = await fetch(`https://api.worldbank.org/v2/country/${match.iso2}?format=json`);
        const [, [info]] = await wbRes.json();
        return {
          country: match.name,
          capital: match.capital || info?.capitalCity,
          iso2: match.iso2,
          region: info?.region?.value,
        };
      } catch {
        return { country: match.name, capital: match.capital, iso2: match.iso2 };
      }
    },
  },
];
