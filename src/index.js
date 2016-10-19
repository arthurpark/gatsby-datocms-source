import { SiteClient, Loader } from 'datocms-client';
import { camelize } from 'humps';

import {
  graphql,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLBoolean,
  GraphQLString,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLUnionType,
} from 'graphql'

const GraphQLDatoImageField = new GraphQLObjectType({
  name: `${prefix}image`,
  fields: {
    format: { type: GraphQLString },
    size: { type: GraphQLInt },
    url: { type: GraphQLString },
    width: { type: GraphQLInt },
    height: { type: GraphQLInt },
  },
});

const GraphQLDatoSeoField = new GraphQLObjectType({
  name: `${prefix}seo`,
  fields: {
    title: { type: GraphQLString },
    description: { type: GraphQLString },
    image: { type: GraphQLDatoImageField },
  },
});

const GraphQLDatoFileField = new GraphQLObjectType({
  name: `${prefix}file`,
  fields: {
    format: { type: GraphQLString },
    size: { type: GraphQLInt },
    url: { type: GraphQLString },
  },
});

const GraphQLDatoLatLonField = new GraphQLObjectType({
  name: `${prefix}lat_lon`,
  fields: {
    latitude: { type: GraphQLFloat },
    longitude: { type: GraphQLFloat },
  },
});

const GraphQLDatoGlobalSeoField = new GraphQLObjectType({
  name: `${prefix}global_seo`,
  fields: {
    siteName: { type: GraphQLString },
    titleSuffix: { type: GraphQLString },
    facebookPageUrl: { type: GraphQLString },
    twitterAccount: { type: GraphQLString },
    fallbackSeo: { type: GraphQLDatoSeoField },
  },
});

const fieldGraphQLTypes = {
  string: GraphQLString,
  text: GraphQLString,
  float: GraphQLFloat,
  integer: GraphQLInt,
  boolean: GraphQLBoolean,
  date: GraphQLString,
  date_time: GraphQLString,
  file: GraphQLDatoFileField,
  image: GraphQLDatoImageField,
  lat_lon: GraphQLDatoLatLonField,
  seo: GraphQLDatoSeoField,
};

export default async function bootDatoCms(prefix, config) {
  const client = new SiteClient(config.apiToken);
  const loader = new Loader(client);

  await loader.load();

  const entities = loader.entitiesRepo;
  const dato = loader.itemsRepo;

  const itemTypeGraphQLTypes = dato.itemTypes
  .reduce((acc, itemType) => {

    const GraphQLDatoItemType = new GraphQLObjectType({
      name: `${prefix}${itemType.apiKey}`,
      fields() {
        const fields = {
          id: { type: GraphQLID },
          itemType: { type: GraphQLString },
          updatedAt: { type: GraphQLString },
          slug: { type: GraphQLString },
          slugWithPrefix: { type: GraphQLString },
        };

        return itemType.fields
          .reduce((fieldsAcc, field) => {

            let type = fieldGraphQLTypes[field.fieldType];

            if (field.fieldType === 'links') {
              const linkedItemTypes = field.validators.itemsItemType.itemTypes
                .map(id => entities.findEntity('item_type', id))
                .map(itemType => itemTypeGraphQLTypes[itemType.apiKey]);

              if (linkedItemTypes.length > 1) {
                const GraphQLDatoLinkType = new GraphQLUnionType({
                  name: `${prefix}${itemType.apiKey}_${field.apiKey}_links`,
                  types: linkedItemTypes,
                  resolveType(data) {
                    return itemTypeGraphQLTypes[data.itemType];
                  }
                });

                type = new GraphQLList(GraphQLDatoLinkType);
              } else {
                type = new GraphQLList(linkedItemTypes[0]);
              }

            } else if (field.fieldType === 'link') {
              const linkedItemTypes = field.validators.itemItemType.itemTypes
                .map(id => entities.findEntity('item_type', id))
                .map(itemType => itemTypeGraphQLTypes[itemType.apiKey]);

              if (linkedItemTypes.length > 1) {
                const GraphQLDatoLinkType = new GraphQLUnionType({
                  name: `${prefix}${itemType.apiKey}_${field.apiKey}_link`,
                  types: linkedItemTypes,
                  resolveType(data) {
                    return itemTypeGraphQLTypes[data.itemType];
                  }
                });

                type = GraphQLDatoLinkType;
              } else {
                console.log(linkedItemTypes[0]);
                type = linkedItemTypes[0];
              }
            }

            return Object.assign(
              {},
              fieldsAcc,
              {
                [camelize(field.apiKey)]: {
                  type,
                  resolve(item, args) {
                    return item[camelize(field.apiKey)];
                  }
                }
              }
            );
          }, fields);
      }
    });

    return Object.assign(
      {}, acc,
      { [itemType.apiKey]: GraphQLDatoItemType }
    );
  }, {});

  const GraphQLDatoRootType = new GraphQLObjectType({
    name: prefix,
    fields: Object.entries(dato.itemTypeMethods).reduce((acc, [apiKey, { method, singleton }]) => {
      return Object.assign(
        {}, acc,
        {
          [method]: {
            type: singleton ? itemTypeGraphQLTypes[apiKey] : new GraphQLList(itemTypeGraphQLTypes[apiKey]),
            resolve(dato) {
              const value = dato.collectionsByType[method];
              if (singleton) {
                return value ? value.toMap() : value;
              } else {
                return value.map(item => item.toMap());
              }
            }
          }
        }
      )
    }, {}),
  });

  return {
    [prefix]: {
      type: GraphQLDatoRootType,
      resolve() {
        return dato;
      },
    },
  };
}
