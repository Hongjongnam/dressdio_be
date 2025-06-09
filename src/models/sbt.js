const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const SBT = sequelize.define(
  "SBT",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    tokenId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    owner: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    creatorType: {
      type: DataTypes.ENUM("artist", "influencer", "brand"),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tokenURI: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    transactionHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    useCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    timestamps: true,
    tableName: "sbts",
  }
);

module.exports = SBT;
