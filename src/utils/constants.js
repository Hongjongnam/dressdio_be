// Creator Types
const CREATOR_TYPES = {
  ARTIST: "artist",
  INFLUENCER: "influencer",
  BRAND: "brand",
};

// IPFS URIs for each creator type
const IPFS_URIS = {
  [CREATOR_TYPES.ARTIST]:
    "https://ipfs.io/ipfs/QmVjNKowy3nqoaA7atZe615R7XcVcu2eMPknmimHnbybyV",
  [CREATOR_TYPES.INFLUENCER]:
    "https://ipfs.io/ipfs/QmWA53Ma6jos1SqWA8b8ZuRKJh2bm5U26YYE5soHmKR38T",
  [CREATOR_TYPES.BRAND]:
    "https://ipfs.io/ipfs/QmX39UUBB2KVGs27qXscrqZYLmibDcUSUx5pnf8MoFEDHC",
};

module.exports = {
  CREATOR_TYPES,
  IPFS_URIS,
};
