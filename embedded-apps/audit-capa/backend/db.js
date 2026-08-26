const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

const emptyDatabase = {
  audits: [],
  capas: [],
  notifications: [],
};

const ensureDatabase = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(emptyDatabase, null, 2),
      "utf8"
    );
  }
};

const readDatabase = () => {
  ensureDatabase();

  try {
    const data = fs.readFileSync(DATA_FILE, "utf8");
    return {
      ...emptyDatabase,
      ...JSON.parse(data),
    };
  } catch (error) {
    console.error("Unable to read local API database:", error);
    return { ...emptyDatabase };
  }
};

const writeDatabase = (data) => {
  ensureDatabase();
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );
};

module.exports = {
  readDatabase,
  writeDatabase,
};
