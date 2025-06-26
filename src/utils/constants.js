// Creator Types
const CREATOR_TYPES = {
  ARTIST: "artist",
  INFLUENCER: "influencer",
  BRAND: "brand",
};

// IPFS URIs for each creator type
const IPFS_URIS = {
  [CREATOR_TYPES.ARTIST]:
    "https://ipfs.io/ipfs/QmX2vnXSmdHR8uZQNduQUv8e4XdAb1hKFYahbrfELZuCUR",
  [CREATOR_TYPES.INFLUENCER]:
    "https://ipfs.io/ipfs/QmSWVngpmwDBcUikQTUNWXKUxxKhcQDFPoP5UwqXUT5BhF",
  [CREATOR_TYPES.BRAND]:
    "https://ipfs.io/ipfs/QmZQ3jf6Gnbw1Ez8BrCzNbXxc1pQFh2qKXwu1FubrnPgQU",
};

module.exports = {
  CREATOR_TYPES,
  IPFS_URIS,
};
