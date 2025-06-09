const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

const Sbt = sequelize.define(
  "Sbt",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    walletAddress: {
      type: DataTypes.STRING(42),
      allowNull: false,
      unique: true,
      validate: {
        isEthereumAddress(value) {
          if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
            throw new Error("Invalid Ethereum address format");
          }
        },
      },
    },
    creatorType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [["designer", "brand", "influencer", "artist"]], // 허용된 크리에이터 타입
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tokenId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    mintedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    status: {
      type: DataTypes.ENUM("pending", "minted", "failed"),
      defaultValue: "pending",
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["walletAddress"],
      },
      {
        fields: ["creatorType"],
      },
      {
        fields: ["status"],
      },
    ],
  }
);

module.exports = Sbt;
