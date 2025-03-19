const DB_FILE = 'ticketing.db';
const DB_FILES = [
  DB_FILE,
  `${DB_FILE}-wal`,
  `${DB_FILE}-shm`
];

async function nukeDb() {
  for (const file of DB_FILES) {
    try {
      await Bun.write(file, '');
      console.log(`Successfully deleted: ${file}`);
    } catch (error) {
      if ((error as Error).message.includes('No such file or directory')) {
        console.log(`File ${file} does not exist`);
      } else {
        console.error(`Error deleting ${file}:`, error);
        process.exit(1);
      }
    }
  }
  console.log('Database cleanup completed');
}

nukeDb(); 