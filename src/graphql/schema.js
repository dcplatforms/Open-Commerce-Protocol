const {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
} = require("graphql");
const WalletService = require("../services/wallet");
const db = require("../utils/database");

module.exports = (walletService) => {
  const WalletType = new GraphQLObjectType({
    name: "Wallet",
    fields: {
      id: { type: new GraphQLNonNull(GraphQLString) },
      userId: { type: new GraphQLNonNull(GraphQLString) },
      balance: { type: new GraphQLNonNull(GraphQLString) },
      currency: { type: new GraphQLNonNull(GraphQLString) },
      status: { type: new GraphQLNonNull(GraphQLString) },
    },
  });

  const RootQueryType = new GraphQLObjectType({
    name: "Query",
    fields: {
      wallet: {
        type: WalletType,
        args: {
          id: { type: new GraphQLNonNull(GraphQLString) },
        },
        resolve: (parent, args) => walletService.getWallet(args.id),
      },
    },
  });

  return new GraphQLSchema({
    query: RootQueryType,
  });
};
