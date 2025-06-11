const sequelize = require("../config/database");
const { DataTypes } = require("sequelize");

const SBT = sequelize.define(
  "SBT",
  {
    tokenId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "token_id",
    },
    owner: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    creatorType: {
      type: DataTypes.ENUM("artist", "influencer", "brand"),
      allowNull: false,
      field: "creator_type",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tokenURI: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "token_u_r_i",
    },
    transactionHash: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "transaction_hash",
    },
    useCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "use_count",
    },
  },
  {
    tableName: "sbts",
    timestamps: true,
    paranoid: true,
  }
);

module.exports = SBT;
