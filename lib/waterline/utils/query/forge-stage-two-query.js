/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var getModel = require('../ontology/get-model');
var getAttribute = require('../ontology/get-attribute');
var isCapableOfOptimizedPopulate = require('../ontology/is-capable-of-optimized-populate');
var normalizePkValues = require('./private/normalize-pk-values');
var normalizeCriteria = require('./private/normalize-criteria');
var normalizeNewRecord = require('./private/normalize-new-record');
var normalizeValueToSet = require('./private/normalize-value-to-set');
var buildUsageError = require('./private/build-usage-error');


/**
 * forgeStageTwoQuery()
 *
 * Normalize and validate userland query keys (called a "stage 1 query" -- see `ARCHITECTURE.md`)
 * i.e. these are things like `criteria` or `populates` that are passed in, either explicitly or
 * implicitly, to a static model method (fka "collection method") such as `.find()`.
 *
 * > This DOES NOT RETURN ANYTHING!  Instead, it modifies the provided "stage 1 query" in-place.
 * > And when this is finished, the provided "stage 1 query" will be a normalized, validated
 * > "stage 2 query" - aka logical protostatement.
 *
 *
 * @param {Dictionary} query   [A stage 1 query to destructively mutate into a stage 2 query.]
 *   | @property {String} method
 *   | @property {Dictionary} meta
 *   | @property {String} using
 *   |
 *   |...PLUS a number of other potential properties, depending on the "method". (see below)
 *
 * @param {Ref} orm
 *        The Waterline ORM instance.
 *        > Useful for accessing the model definitions.
 *
 *
 * @throws {Error} If it encounters irrecoverable problems or unsupported usage in the provided query keys.
 *         @property {String} code
 *                   One of:
 *                   - E_INVALID_META                    (universal)
 *                   - E_INVALID_CRITERIA
 *                   - E_INVALID_POPULATES
 *                   - E_INVALID_NUMERIC_ATTR_NAME
 *                   - E_INVALID_STREAM_ITERATEE         (for `eachBatchFn` & `eachRecordFn`)
 *                   - E_INVALID_NEW_RECORD
 *                   - E_INVALID_NEW_RECORDS
 *                   - E_INVALID_VALUES_TO_SET
 *                   - E_INVALID_TARGET_RECORD_IDS
 *                   - E_INVALID_COLLECTION_ATTR_NAME
 *                   - E_INVALID_ASSOCIATED_IDS
 *
 *
 * @throws {Error} If anything else unexpected occurs
 */
module.exports = function forgeStageTwoQuery(query, orm) {
  // console.time('forgeStageTwoQuery');

  //   ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗    ████████╗██╗  ██╗███████╗
  //  ██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝    ╚══██╔══╝██║  ██║██╔════╝
  //  ██║     ███████║█████╗  ██║     █████╔╝        ██║   ███████║█████╗
  //  ██║     ██╔══██║██╔══╝  ██║     ██╔═██╗        ██║   ██╔══██║██╔══╝
  //  ╚██████╗██║  ██║███████╗╚██████╗██║  ██╗       ██║   ██║  ██║███████╗
  //   ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝       ╚═╝   ╚═╝  ╚═╝╚══════╝
  //
  //  ███████╗███████╗███████╗███████╗███╗   ██╗████████╗██╗ █████╗ ██╗     ███████╗
  //  ██╔════╝██╔════╝██╔════╝██╔════╝████╗  ██║╚══██╔══╝██║██╔══██╗██║     ██╔════╝
  //  █████╗  ███████╗███████╗█████╗  ██╔██╗ ██║   ██║   ██║███████║██║     ███████╗
  //  ██╔══╝  ╚════██║╚════██║██╔══╝  ██║╚██╗██║   ██║   ██║██╔══██║██║     ╚════██║
  //  ███████╗███████║███████║███████╗██║ ╚████║   ██║   ██║██║  ██║███████╗███████║
  //  ╚══════╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝



  //  ┌─┐┬ ┬┌─┐┌─┐┬┌─  ╔╦╗╔═╗╔╦╗╔═╗    ┌─  ┬┌─┐  ┌─┐┬─┐┌─┐┬  ┬┬┌┬┐┌─┐┌┬┐  ─┐
  //  │  ├─┤├┤ │  ├┴┐  ║║║║╣  ║ ╠═╣    │   │├┤   ├─┘├┬┘│ │└┐┌┘│ ││├┤  ││   │
  //  └─┘┴ ┴└─┘└─┘┴ ┴  ╩ ╩╚═╝ ╩ ╩ ╩    └─  ┴└    ┴  ┴└─└─┘ └┘ ┴─┴┘└─┘─┴┘  ─┘
  // If specified, check `meta`.
  if (!_.isUndefined(query.meta)) {

    if (!_.isObject(query.meta) || _.isArray(query.meta) || _.isFunction(query.meta)) {
      throw buildUsageError('E_INVALID_META',
        'If `meta` is provided, it should be a dictionary (i.e. a plain JavaScript object).  '+
        'But instead, got: ' + util.inspect(query.meta, {depth:null})+''
      );
    }//-•

  }//>-•

  // Unless `meta.typeSafety` is explicitly set to `''`, then we'll consider ourselves
  // to be ensuring type safety.
  var ensureTypeSafety = (!query.meta || query.meta.typeSafety !== '');


  //  ┌─┐┬ ┬┌─┐┌─┐┬┌─  ╦ ╦╔═╗╦╔╗╔╔═╗
  //  │  ├─┤├┤ │  ├┴┐  ║ ║╚═╗║║║║║ ╦
  //  └─┘┴ ┴└─┘└─┘┴ ┴  ╚═╝╚═╝╩╝╚╝╚═╝
  // Always check `using`.
  if (!_.isString(query.using) || query.using === '') {
    throw new Error(
      'Consistency violation: Every stage 1 query should include a property called `using` as a non-empty string.'+
      '  But instead, got: ' + util.inspect(query.using, {depth:null})
    );
  }//-•


  // Look up the Waterline model for this query.
  // > This is so that we can reference the original model definition.
  var WLModel;
  try {
    WLModel = getModel(query.using, orm);
  } catch (e) {
    switch (e.code) {
      case 'E_MODEL_NOT_REGISTERED': throw new Error('Consistency violation: The specified `using` ("'+query.using+'") does not match the identity of any registered model.');
      default: throw e;
    }
  }//</catch>


  //  ┌─┐┬ ┬┌─┐┌─┐┬┌─  ╔╦╗╔═╗╔╦╗╦ ╦╔═╗╔╦╗
  //  │  ├─┤├┤ │  ├┴┐  ║║║║╣  ║ ╠═╣║ ║ ║║
  //  └─┘┴ ┴└─┘└─┘┴ ┴  ╩ ╩╚═╝ ╩ ╩ ╩╚═╝═╩╝
  //   ┬   ┌─┐┬ ┬┌─┐┌─┐┬┌─  ┌─┐┌─┐┬─┐  ┌─┐─┐ ┬┌┬┐┬─┐┌─┐┌┐┌┌─┐┌─┐┬ ┬┌─┐  ┬┌─┌─┐┬ ┬┌─┐
  //  ┌┼─  │  ├─┤├┤ │  ├┴┐  ├┤ │ │├┬┘  ├┤ ┌┴┬┘ │ ├┬┘├─┤│││├┤ │ ││ │└─┐  ├┴┐├┤ └┬┘└─┐
  //  └┘   └─┘┴ ┴└─┘└─┘┴ ┴  └  └─┘┴└─  └─┘┴ └─ ┴ ┴└─┴ ┴┘└┘└─┘└─┘└─┘└─┘  ┴ ┴└─┘ ┴ └─┘┘
  //   ┬   ┌┬┐┌─┐┌┬┐┌─┐┬─┐┌┬┐┬┌┐┌┌─┐  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬  ┬┌─┌─┐┬ ┬┌─┐
  //  ┌┼─   ││├┤  │ ├┤ ├┬┘│││││││├┤   │─┼┐│ │├┤ ├┬┘└┬┘  ├┴┐├┤ └┬┘└─┐
  //  └┘   ─┴┘└─┘ ┴ └─┘┴└─┴ ┴┴┘└┘└─┘  └─┘└└─┘└─┘┴└─ ┴   ┴ ┴└─┘ ┴ └─┘
  // Always check `method`.
  if (!_.isString(query.method) || query.method === '') {
    throw new Error(
      'Consistency violation: Every stage 1 query should include a property called `method` as a non-empty string.'+
      '  But instead, got: ' + util.inspect(query.method, {depth:null})
    );
  }//-•



  // Determine the set of acceptable query keys for the specified `method`.
  // (and, in the process, assert that we recognize this method in the first place)
  var queryKeys = (function _getQueryKeys (){

    switch(query.method) {

      case 'find':                 return [ 'criteria', 'populates' ];
      case 'findOne':              return [ 'criteria', 'populates' ];
      case 'stream':               return [ 'criteria', 'populates', 'eachRecordFn', 'eachBatchFn' ];
      case 'count':                return [ 'criteria' ];
      case 'sum':                  return [ 'numericAttrName', 'criteria' ];
      case 'avg':                  return [ 'numericAttrName', 'criteria' ];

      case 'create':               return [ 'newRecord' ];
      case 'createEach':           return [ 'newRecords' ];
      case 'findOrCreate':         return [ 'criteria', 'newRecord' ];

      case 'update':               return [ 'criteria', 'valuesToSet' ];
      case 'destroy':              return [ 'criteria' ];
      case 'addToCollection':      return [ 'targetRecordIds', 'collectionAttrName', 'associatedIds' ];
      case 'removeFromCollection': return [ 'targetRecordIds', 'collectionAttrName', 'associatedIds' ];
      case 'replaceCollection':    return [ 'targetRecordIds', 'collectionAttrName', 'associatedIds' ];

      default:
        throw new Error('Consistency violation: Unrecognized `method` ("'+query.method+'")');

    }

  })();//</self-calling function :: _getQueryKeys()>


  // > Note:
  // >
  // > It's OK if keys are missing at this point.  We'll do our best to
  // > infer a reasonable default, when possible.  In some cases, it'll
  // > still fail validation later, but in other cases, it'll pass.
  // >
  // > Anyway, that's all handled below.


  // Now check that we see ONLY the expected keys for that method.
  // (i.e. there should never be any miscellaneous stuff hanging out on the stage1 query dictionary)

  // We start off by building up an array of legal keys, starting with the universally-legal ones.
  var allowedKeys = [
    'meta',
    'using',
    'method'
  ].concat(queryKeys);


  // Then finally, we check that no extraneous keys are present.
  var extraneousKeys = _.difference(_.keys(query), allowedKeys);
  if (extraneousKeys.length > 0) {
    throw new Error('Consistency violation: Provided "stage 1 query" contains extraneous top-level keys: '+extraneousKeys);
  }



  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -


  //   ██████╗██████╗ ██╗████████╗███████╗██████╗ ██╗ █████╗
  //  ██╔════╝██╔══██╗██║╚══██╔══╝██╔════╝██╔══██╗██║██╔══██╗
  //  ██║     ██████╔╝██║   ██║   █████╗  ██████╔╝██║███████║
  //  ██║     ██╔══██╗██║   ██║   ██╔══╝  ██╔══██╗██║██╔══██║
  //  ╚██████╗██║  ██║██║   ██║   ███████╗██║  ██║██║██║  ██║
  //   ╚═════╝╚═╝  ╚═╝╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝
  //
  if (_.contains(queryKeys, 'criteria')) {

    //  ╔╦╗╔═╗╔═╗╔═╗╦ ╦╦ ╔╦╗
    //   ║║║╣ ╠╣ ╠═╣║ ║║  ║
    //  ═╩╝╚═╝╚  ╩ ╩╚═╝╩═╝╩
    // Tolerate this being left undefined by inferring a reasonable default.
    // (This will be further processed below.)
    if (_.isUndefined(query.criteria)) {
      query.criteria = {};
    }//>-


    //  ╔═╗╔═╗╔═╗╔═╗╦╔═╗╦    ╔═╗╔═╗╔═╗╔═╗╔═╗
    //  ╚═╗╠═╝║╣ ║  ║╠═╣║    ║  ╠═╣╚═╗║╣ ╚═╗
    //  ╚═╝╩  ╚═╝╚═╝╩╩ ╩╩═╝  ╚═╝╩ ╩╚═╝╚═╝╚═╝
    //  ┌─    ┬ ┌─┐   ┬ ┬┌┐┌┌─┐┬ ┬┌─┐┌─┐┌─┐┬─┐┌┬┐┌─┐┌┬┐  ┌─┐┌─┐┌┬┐┌┐ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌┌─┐  ┌─┐┌─┐
    //  │───  │ ├┤    │ ││││└─┐│ │├─┘├─┘│ │├┬┘ │ ├┤  ││  │  │ ││││├┴┐││││├─┤ │ ││ ││││└─┐  │ │├┤
    //  └─    ┴o└─┘o  └─┘┘└┘└─┘└─┘┴  ┴  └─┘┴└─ ┴ └─┘─┴┘  └─┘└─┘┴ ┴└─┘┴┘└┘┴ ┴ ┴ ┴└─┘┘└┘└─┘  └─┘└
    //        ┌─┐┌─┐┬─┐┌┬┐┌─┐┬┌┐┌  ┌─┐┬─┐┬┌┬┐┌─┐┬─┐┬┌─┐  ┌─┐┬  ┌─┐┬ ┬┌─┐┌─┐┌─┐  ┌─┐┌─┐┬─┐
    //        │  ├┤ ├┬┘ │ ├─┤││││  │  ├┬┘│ │ ├┤ ├┬┘│├─┤  │  │  ├─┤│ │└─┐├┤ └─┐  ├┤ │ │├┬┘
    //        └─┘└─┘┴└─ ┴ ┴ ┴┴┘└┘  └─┘┴└─┴ ┴ └─┘┴└─┴┴ ┴  └─┘┴─┘┴ ┴└─┘└─┘└─┘└─┘  └  └─┘┴└─
    //        ┌─┐┌─┐┌─┐┌─┐┬┌─┐┬┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┬    ┌┬┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐┌─┐    ─┐
    //        └─┐├─┘├┤ │  │├┤ ││    ││││ │ ││├┤ │    │││├┤  │ ├─┤│ │ ││└─┐  ───│
    //        └─┘┴  └─┘└─┘┴└  ┴└─┘  ┴ ┴└─┘─┴┘└─┘┴─┘  ┴ ┴└─┘ ┴ ┴ ┴└─┘─┴┘└─┘    ─┘
    //
    // Next, handle a few special cases that we are careful to fail loudly about.
    //
    // > Because if we don't, it can cause major confusion.  Think about it: in some cases,
    // > certain usage can seem intuitive, and like a reasonable enough thing to try out...
    // > ...but it might actually be unsupported!
    // >
    // > And when you do try it out, unless it fails LOUDLY, then you could easily end
    // > up believing that it is actually doing something.  And then, as is true when
    // > working w/ any library or framework, you end up with all sorts of weird superstitions
    // > and false assumptions that take a long time to wring out of your code base.
    // > So let's do our best to prevent that!

    //
    // > WARNING:
    // > It is really important that we do this BEFORE we normalize the criteria!
    // > (Because by then, it'll be too late to tell what was and wasn't included
    // >  in the original, unnormalized criteria dictionary.)
    //

    // If the criteria explicitly specifies `select` or `omit`, then make sure the query method
    // is actually compatible with those clauses.
    if (_.isObject(query.criteria) && (!_.isUndefined(query.criteria.select) || !_.isUndefined(query.criteria.omit))) {

      var PROJECTION_COMPATIBLE_METHODS = ['find', 'findOne', 'stream'];
      var isCompatibleWithProjections = _.contains(PROJECTION_COMPATIBLE_METHODS, query.method);
      if (!isCompatibleWithProjections) {
        throw buildUsageError('E_INVALID_CRITERIA', 'Cannot use `select`/`omit` with this query method (`'+query.method+'`).');
      }

    }//>-•

    // If the criteria explicitly specifies `limit`, then make sure the query method
    // is actually compatible with that clause.
    if (_.isObject(query.criteria) && !_.isUndefined(query.criteria.limit)) {

      var LIMIT_COMPATIBLE_METHODS = ['find', 'stream', 'sum', 'avg', 'update', 'destroy'];
      var isCompatibleWithLimit = _.contains(LIMIT_COMPATIBLE_METHODS, query.method);
      if (!isCompatibleWithLimit) {
        throw buildUsageError('E_INVALID_CRITERIA', 'Cannot use `limit` with this query method (`'+query.method+'`).');
      }

    }//>-•




    //  ╔╗╔╔═╗╦═╗╔╦╗╔═╗╦  ╦╔═╗╔═╗   ┬   ╦  ╦╔═╗╦  ╦╔╦╗╔═╗╔╦╗╔═╗
    //  ║║║║ ║╠╦╝║║║╠═╣║  ║╔═╝║╣   ┌┼─  ╚╗╔╝╠═╣║  ║ ║║╠═╣ ║ ║╣
    //  ╝╚╝╚═╝╩╚═╩ ╩╩ ╩╩═╝╩╚═╝╚═╝  └┘    ╚╝ ╩ ╩╩═╝╩═╩╝╩ ╩ ╩ ╚═╝
    // Validate and normalize the provided `criteria`.
    try {
      query.criteria = normalizeCriteria(query.criteria, query.using, orm, ensureTypeSafety);
    } catch (e) {
      switch (e.code) {

        case 'E_HIGHLY_IRREGULAR':
          throw buildUsageError('E_INVALID_CRITERIA', e.message);

        case 'E_WOULD_RESULT_IN_NOTHING':
          throw new Error('Consistency violation: The provided criteria (`'+util.inspect(query.criteria, {depth: null})+'`) is deliberately designed to NOT match any records.  Instead of attempting to forge it into a stage 2 query, it should have already been thrown out at this point.  Where backwards compatibility is desired, the higher-level query method should have taken charge of the situation earlier, and triggered the userland callback function in such a way that it simulates no matches (e.g. with an empty result set `[]`, if this is a "find").  Details: '+e.message);

        // If no error code (or an unrecognized error code) was specified,
        // then we assume that this was a spectacular failure do to some
        // kind of unexpected, internal error on our part.
        default:
          throw new Error('Consistency violation: Encountered unexpected internal error when attempting to normalize/validate the provided criteria:\n'+util.inspect(query.criteria, {depth:null})+'\n\nError details:\n'+e.stack);
      }
    }//>-•

  }// >-•




  //  ██████╗  ██████╗ ██████╗ ██╗   ██╗██╗      █████╗ ████████╗███████╗███████╗
  //  ██╔══██╗██╔═══██╗██╔══██╗██║   ██║██║     ██╔══██╗╚══██╔══╝██╔════╝██╔════╝
  //  ██████╔╝██║   ██║██████╔╝██║   ██║██║     ███████║   ██║   █████╗  ███████╗
  //  ██╔═══╝ ██║   ██║██╔═══╝ ██║   ██║██║     ██╔══██║   ██║   ██╔══╝  ╚════██║
  //  ██║     ╚██████╔╝██║     ╚██████╔╝███████╗██║  ██║   ██║   ███████╗███████║
  //  ╚═╝      ╚═════╝ ╚═╝      ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚══════╝
  //
  // Validate/normalize the `populates` query key.
  //
  // > NOTE: At this point, we know that the `criteria` query key has already been checked/normalized.
  if (_.contains(queryKeys, 'populates')) {

    // Tolerate this being left undefined by inferring a reasonable default.
    if (_.isUndefined(query.populates)) {
      query.populates = {};
    }//>-

    // Verify that `populates` is a dictionary.
    if (!_.isObject(query.populates) || _.isArray(query.populates) || _.isFunction(query.populates)) {
      throw buildUsageError('E_INVALID_POPULATES',
        '`populates` must be a dictionary.  But instead, got: '+util.inspect(query.populates, {depth: null})
      );
    }//-•


    // For each key in our `populates` dictionary...
    _.each(_.keys(query.populates), function (populateAttrName) {

      // For compatibility, if the RHS of this "populate" directive was set to `false`
      // or to `undefined`, understand it to mean the same thing as if this particular
      // populate directive wasn't included in the first place.  In other words, strip
      // this key from the `populates` dictionary and just return early.
      if (query.populates[populateAttrName] === false || _.isUndefined(query.populates[populateAttrName])) {
        delete query.populates[populateAttrName];
        return;
      }//-•

      // If trying to populate an association that is ALSO being omitted (in the primary criteria),
      // then we say this is invalid.
      //
      // > We know that the primary criteria has been normalized already at this point.
      if (_.contains(query.criteria.omit, populateAttrName)) {
        throw buildUsageError('E_INVALID_POPULATES',
          'Could not populate `'+populateAttrName+'`.  '+
          'This query also indicates that this attribute should be omitted.  '+
          'Cannot populate AND omit an association at the same time!'
        );
      }//-•

      // If trying to populate an association that was not included in an explicit
      // `select` clause in the primary criteria, then modify that select clause so that
      // it is included.
      //
      // > We know that the primary criteria has been normalized already at this point.
      if (query.criteria.select[0] !== '*' && !_.contains(query.criteria.select, populateAttrName)) {
        query.criteria.select.push(populateAttrName);
      }//>-


      // If trying to populate an association that was ALSO included in an explicit
      // `sort` clause in the primary criteria, then don't allow this to be populated.
      //
      // > We know that the primary criteria has been normalized already at this point.
      var isMentionedInPrimarySort = _.any(query.criteria.sort, function (comparatorDirective){
        var sortBy = _.keys(comparatorDirective)[0];
        return (sortBy === populateAttrName);
      });
      if (isMentionedInPrimarySort) {
        throw buildUsageError('E_INVALID_POPULATES',
          'Could not populate `'+populateAttrName+'`.  '+
          'Cannot populate AND sort by an association at the same time!'
        );
      }//>-


      // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
      // FUTURE: Prevent (probably) trying to populate a association that was ALSO referenced somewhere
      // from within the `where` clause in the primary criteria.
      //
      // > If you have a use case for why you want to be able to do this, please open an issue in the
      // > main Sails repo and at-mention @mikermcneil, @particlebanana, or another core team member.
      // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -


      //  ┬  ┌─┐┌─┐┬┌─  ┬ ┬┌─┐  ╔═╗╔╦╗╔╦╗╦═╗  ╔╦╗╔═╗╔═╗  ┌─┐┌─┐┬─┐  ┌─┐┌─┐┌─┐┌─┐┌─┐┬┌─┐┌┬┐┬┌─┐┌┐┌
      //  │  │ ││ │├┴┐  │ │├─┘  ╠═╣ ║  ║ ╠╦╝   ║║║╣ ╠╣   ├┤ │ │├┬┘  ├─┤└─┐└─┐│ ││  │├─┤ │ ││ ││││
      //  ┴─┘└─┘└─┘┴ ┴  └─┘┴    ╩ ╩ ╩  ╩ ╩╚═  ═╩╝╚═╝╚    └  └─┘┴└─  ┴ ┴└─┘└─┘└─┘└─┘┴┴ ┴ ┴ ┴└─┘┘└┘
      // Look up the attribute definition for the association being populated.
      // (at the same time, validating that an association by this name actually exists in this model definition.)
      var populateAttrDef;
      try {
        populateAttrDef = getAttribute(populateAttrName, query.using, orm);
      } catch (e) {
        switch (e.code) {
          case 'E_ATTR_NOT_REGISTERED':
            throw buildUsageError('E_INVALID_POPULATES',
              'Could not populate `'+populateAttrName+'`.  '+
              'There is no attribute named `'+populateAttrName+'` defined in this model.'
            );
          default: throw new Error('Consistency violation: When attempting to populate `'+populateAttrName+'` for this model (`'+query.using+'`), an unexpected error occurred looking up the association\'s definition.  This SHOULD never happen.  Details: '+e.stack);
        }
      }//</catch>


      //  ┬  ┌─┐┌─┐┬┌─  ┬ ┬┌─┐  ┬┌┐┌┌─┐┌─┐  ┌─┐┌┐┌  ┌┬┐┬ ┬┌─┐  ╔═╗╔╦╗╦ ╦╔═╗╦═╗  ╔╦╗╔═╗╔╦╗╔═╗╦
      //  │  │ ││ │├┴┐  │ │├─┘  ││││├┤ │ │  │ ││││   │ ├─┤├┤   ║ ║ ║ ╠═╣║╣ ╠╦╝  ║║║║ ║ ║║║╣ ║
      //  ┴─┘└─┘└─┘┴ ┴  └─┘┴    ┴┘└┘└  └─┘  └─┘┘└┘   ┴ ┴ ┴└─┘  ╚═╝ ╩ ╩ ╩╚═╝╩╚═  ╩ ╩╚═╝═╩╝╚═╝╩═╝
      // Determine the identity of the other (associated) model, then use that to make
      // sure that the other model's definition is actually registered in our `orm`.
      var otherModelIdentity;
      if (populateAttrDef.model) {
        otherModelIdentity = populateAttrDef.model;
      }//‡
      else if (populateAttrDef.collection) {
        otherModelIdentity = populateAttrDef.collection;
      }//‡
      // Otherwise, this query is invalid, since the attribute with this name is
      // neither a "collection" nor a "model" association.
      else {
        throw buildUsageError('E_INVALID_POPULATES',
          'Could not populate `'+populateAttrName+'`.  '+
          'The attribute named `'+populateAttrName+'` defined in this model (`'+query.using+'`)'+
          'is not defined as a "collection" or "model" association, and thus cannot '+
          'be populated.  Instead, its definition looks like this:\n'+
          util.inspect(populateAttrDef, {depth: null})
        );
      }//>-•



      //  ┌─┐┬ ┬┌─┐┌─┐┬┌─  ┌┬┐┬ ┬┌─┐  ╦═╗╦ ╦╔═╗
      //  │  ├─┤├┤ │  ├┴┐   │ ├─┤├┤   ╠╦╝╠═╣╚═╗
      //  └─┘┴ ┴└─┘└─┘┴ ┴   ┴ ┴ ┴└─┘  ╩╚═╩ ╩╚═╝

      // If this is a singular ("model") association, then it should always have
      // an empty dictionary on the RHS.  (For this type of association, there is
      // always either exactly one associated record, or none of them.)
      if (populateAttrDef.model) {

        // Tolerate a subcriteria of `{}`, interpreting it to mean that there is
        // really no criteria at all, and that we should just use `true` (the
        // default "enabled" value for singular "model" associations.)
        if (_.isEqual(query.populates[populateAttrName], {})) {
          query.populates[populateAttrName] = true;
        }
        // Otherwise, this simply must be `true`.  Otherwise it's invalid.
        else {

          if (query.populates[populateAttrName] !== true) {
            throw buildUsageError('E_INVALID_POPULATES',
              'Could not populate `'+populateAttrName+'` because of ambiguous usage.  '+
              'This is a singular ("model") association, which means it never refers to '+
              'more than _one_ associated record.  So passing in subcriteria (i.e. as '+
              'the second argument to `.populate()`) is not supported for this association, '+
              'since it wouldn\'t make any sense.  But that\'s the trouble-- it looks like '+
              'some sort of a subcriteria (or something) _was_ provided!\n'+
              '\n'+
              'Here\'s what was passed in:\n'+
              util.inspect(query.populates[populateAttrName], {depth: null})
            );
          }//-•

        }//>-•

      }
      // Otherwise, this is a plural ("collection") association, so we'll need to
      // validate and fully-normalize the provided subcriteria.
      else {

        // For compatibility, interpet a subcriteria of `true` to mean that there
        // is really no subcriteria at all, and that we should just use the default (`{}`).
        // > This will be further expanded into a fully-formed criteria dictionary shortly.
        if (query.populates[populateAttrName] === true) {
          query.populates[populateAttrName] = {};
        }//>-

        // Track whether `sort` was omitted from the subcriteria.
        // (this is used just a little ways down below.)
        //
        // > Be sure to see "FUTURE (1)" for details about how we might improve this in
        // > the future-- it's not a 100% accurate or clean check right now!!
        var wasSubcriteriaSortOmitted = (
          !_.isObject(query.populates[populateAttrName]) ||
          _.isUndefined(query.populates[populateAttrName].sort) ||
          _.isEqual(query.populates[populateAttrName].sort, [])
        );

        // Validate and normalize the provided criteria.
        try {
          query.populates[populateAttrName] = normalizeCriteria(query.populates[populateAttrName], otherModelIdentity, orm, ensureTypeSafety);
        } catch (e) {
          switch (e.code) {

            case 'E_HIGHLY_IRREGULAR':
              throw buildUsageError('E_INVALID_POPULATES',
                'Could not use the specified subcriteria for populating `'+populateAttrName+'`: '+e.message
                // (Tip: Instead of that ^^^, when debugging, replace `e.message` with `e.stack`)
              );

            case 'E_WOULD_RESULT_IN_NOTHING':
              throw new Error('Consistency violation: The provided criteria for populating `'+populateAttrName+'` (`'+util.inspect(query.populates[populateAttrName], {depth: null})+'`) is deliberately designed to NOT match any records.  Instead of attempting to forge it into a stage 2 query, it should have already been stripped out at this point.  Where backwards compatibility is desired, the higher-level query method should have taken charge of the situation earlier, and simulated no matches for this particular "populate" instruction (e.g. with an empty result set `null`/`[]`, depending on the association).  Details: '+e.message);

            // If no error code (or an unrecognized error code) was specified,
            // then we assume that this was a spectacular failure do to some
            // kind of unexpected, internal error on our part.
            default:
              throw new Error('Consistency violation: Encountered unexpected internal error when attempting to normalize/validate the provided criteria for populating `'+populateAttrName+'`:\n'+util.inspect(query.populates[populateAttrName], {depth:null})+'\n\nError details:\n'+e.stack);
          }
        }//>-•


        //  ┌─┐┬─┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐┬┌─┐┌┐┌  ┌─┐┬ ┬┌─┐┌─┐┬┌─
        //  ├─┘├┬┘│ │ │││ ││   │ ││ ││││  │  ├─┤├┤ │  ├┴┐
        //  ┴  ┴└─└─┘─┴┘└─┘└─┘ ┴ ┴└─┘┘└┘  └─┘┴ ┴└─┘└─┘┴ ┴
        //  ┌─┐┌─┐┬─┐  ╔╗╔╔═╗╔╗╔   ╔═╗╔═╗╔╦╗╦╔╦╗╦╔═╗╔═╗╔╦╗  ┌─┐┌─┐┌─┐┬ ┬┬  ┌─┐┌┬┐┌─┐┌─┐
        //  ├┤ │ │├┬┘  ║║║║ ║║║║───║ ║╠═╝ ║ ║║║║║╔═╝║╣  ║║  ├─┘│ │├─┘│ ││  ├─┤ │ ├┤ └─┐
        //  └  └─┘┴└─  ╝╚╝╚═╝╝╚╝   ╚═╝╩   ╩ ╩╩ ╩╩╚═╝╚═╝═╩╝  ┴  └─┘┴  └─┘┴─┘┴ ┴ ┴ └─┘└─┘
        //  ┌┬┐┬ ┬┌─┐┌┬┐  ╔═╗╦  ╔═╗╔═╗  ╦ ╦╔═╗╔═╗  ╔═╗╦ ╦╔╗ ╔═╗╦═╗╦╔╦╗╔═╗╦═╗╦╔═╗
        //   │ ├─┤├─┤ │   ╠═╣║  ╚═╗║ ║  ║ ║╚═╗║╣   ╚═╗║ ║╠╩╗║  ╠╦╝║ ║ ║╣ ╠╦╝║╠═╣
        //   ┴ ┴ ┴┴ ┴ ┴   ╩ ╩╩═╝╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝╚═╝╚═╝╩╚═╩ ╩ ╚═╝╩╚═╩╩ ╩
        // In production, do an additional check:
        if (process.env.NODE_ENV === 'production') {

          // Determine if we are populating an association that does not support a fully-optimized populate.
          var isAssociationFullyCapable = isCapableOfOptimizedPopulate(populateAttrName, query.using, orm);

          // If so, then make sure we are not attempting to perform a "dangerous" populate--
          // that is, one that is not currently safe using our built-in joining shim.
          // (This is related to memory usage, and is a result of the shim's implementation.)
          if (!isAssociationFullyCapable) {

            var subcriteria = query.populates[populateAttrName];
            var isPotentiallyDangerous = (
              subcriteria.skip !== 0 ||
              subcriteria.limit !== (Number.MAX_SAFE_INTEGER||9007199254740991) ||
              !wasSubcriteriaSortOmitted
            );
            // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
            // > FUTURE (1): instead of the overly-simplistic "wasSubcriteriaSortOmitted" check, compare vs
            // > the default. Currently, if you explicitly provide the default `sort`, you'll see this
            // > warning (even though using the default `sort` represents exactly the same subcriteria as if
            // > you'd omitted it entirely).
            // >
            // > e.g.
            // > ```
            //   var isPotentiallyDangerous = (
            //     subcriteria.skip !== 0 ||
            //     subcriteria.limit !== (Number.MAX_SAFE_INTEGER||9007199254740991) ||
            //     !_.isEqual(subcriteria.sort, defaultSort)
            //                                   //^^^ the hard part-- see normalizeSortClause() for why
            //   );
            // > ```
            // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
            // > FUTURE (2): make this check more restrictive-- not EVERYTHING it prevents is actually
            // > dangerous given the current implementation of the shim.  But in the mean time,
            // > better to err on the safe side.
            // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
            // > FUTURE (3): overcome this by implementing a more complicated batching strategy-- however,
            // > this is not a priority right now, since this is only an issue for xD/A associations,
            // > which will likely never come up for the majority of applications.  Our focus is on the
            // > much more common real-world scenario of populating across associations in the same database.
            // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

            if (isPotentiallyDangerous) {
              console.warn(
                'Could not use the specified subcriteria for populating `'+populateAttrName+'`.'+'\n'+
                '\n'+
                'Since this association does not support optimized populates (i.e. it spans multiple '+'\n'+
                'datastores, or uses an adapter that does not support native joins), it is not a good '+'\n'+
                'idea to populate it along with a subcriteria that uses `limit`, `skip`, and/or `sort`-- '+'\n'+
                'at least not in a production environment.  To overcome this, either (A) remove or change '+'\n'+
                'this subcriteria, or (B) configure all involved models to use the same datastore, and/or '+'\n'+
                'switch to an adapter like sails-mysql or sails-postgresql that supports native joins.'
              );
            }//>-   </ if populating would be potentially- dangerous as far as process memory consumption >

          }//>-•  </ if association is NOT fully capable of being populated in a fully-optimized way >

        }//>-•  </ if production >


      }//</else :: this is a plural ("collection") association>


    });//</_.each() key in the `populates` dictionary>

  }//>-•









  //  ███╗   ██╗██╗   ██╗███╗   ███╗███████╗██████╗ ██╗ ██████╗
  //  ████╗  ██║██║   ██║████╗ ████║██╔════╝██╔══██╗██║██╔════╝
  //  ██╔██╗ ██║██║   ██║██╔████╔██║█████╗  ██████╔╝██║██║
  //  ██║╚██╗██║██║   ██║██║╚██╔╝██║██╔══╝  ██╔══██╗██║██║
  //  ██║ ╚████║╚██████╔╝██║ ╚═╝ ██║███████╗██║  ██║██║╚██████╗
  //  ╚═╝  ╚═══╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝╚═╝ ╚═════╝
  //
  //   █████╗ ████████╗████████╗██████╗     ███╗   ██╗ █████╗ ███╗   ███╗███████╗
  //  ██╔══██╗╚══██╔══╝╚══██╔══╝██╔══██╗    ████╗  ██║██╔══██╗████╗ ████║██╔════╝
  //  ███████║   ██║      ██║   ██████╔╝    ██╔██╗ ██║███████║██╔████╔██║█████╗
  //  ██╔══██║   ██║      ██║   ██╔══██╗    ██║╚██╗██║██╔══██║██║╚██╔╝██║██╔══╝
  //  ██║  ██║   ██║      ██║   ██║  ██║    ██║ ╚████║██║  ██║██║ ╚═╝ ██║███████╗
  //  ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝    ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝
  //
  if (_.contains(queryKeys, 'numericAttrName')) {

    if (_.isUndefined(query.numericAttrName)) {
      throw buildUsageError('E_INVALID_NUMERIC_ATTR_NAME',
        'Please specify `numericAttrName` (required for this variety of query).'
      );
    }

    if (!_.isString(query.numericAttrName)) {
      throw buildUsageError('E_INVALID_NUMERIC_ATTR_NAME',
        'Instead of a string, got: '+util.inspect(query.numericAttrName,{depth:null})
      );
    }

    // Validate that an attribute by this name actually exists in this model definition.
    var numericAttrDef;
    try {
      numericAttrDef = getAttribute(query.numericAttrName, query.using, orm);
    } catch (e) {
      switch (e.code) {
        case 'E_ATTR_NOT_REGISTERED':
          throw buildUsageError('E_INVALID_NUMERIC_ATTR_NAME',
            'There is no attribute named `'+query.numericAttrName+'` defined in this model.'
          );
        default: throw e;
      }
    }//</catch>

    // Validate that the attribute with this name is a number.
    if (numericAttrDef.type !== 'number') {
      throw buildUsageError('E_INVALID_NUMERIC_ATTR_NAME',
        'The attribute named `'+query.numericAttrName+'` defined in this model is not guaranteed to be a number (it should declare `type: \'number\'`).'
      );
    }

  }//>-•





  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -



  //  ███████╗ █████╗  ██████╗██╗  ██╗    ██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ██████╗
  //  ██╔════╝██╔══██╗██╔════╝██║  ██║    ██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔══██╗
  //  █████╗  ███████║██║     ███████║    ██████╔╝█████╗  ██║     ██║   ██║██████╔╝██║  ██║
  //  ██╔══╝  ██╔══██║██║     ██╔══██║    ██╔══██╗██╔══╝  ██║     ██║   ██║██╔══██╗██║  ██║
  //  ███████╗██║  ██║╚██████╗██║  ██║    ██║  ██║███████╗╚██████╗╚██████╔╝██║  ██║██████╔╝
  //  ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝
  //
  //      ██╗    ███████╗ █████╗  ██████╗██╗  ██╗    ██████╗  █████╗ ████████╗ ██████╗██╗  ██╗
  //     ██╔╝    ██╔════╝██╔══██╗██╔════╝██║  ██║    ██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██║  ██║
  //    ██╔╝     █████╗  ███████║██║     ███████║    ██████╔╝███████║   ██║   ██║     ███████║
  //   ██╔╝      ██╔══╝  ██╔══██║██║     ██╔══██║    ██╔══██╗██╔══██║   ██║   ██║     ██╔══██║
  //  ██╔╝       ███████╗██║  ██║╚██████╗██║  ██║    ██████╔╝██║  ██║   ██║   ╚██████╗██║  ██║
  //  ╚═╝        ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
  //
  //   ██╗███████╗██╗   ██╗███╗   ██╗ ██████╗████████╗██╗ ██████╗ ███╗   ██╗███████╗██╗
  //  ██╔╝██╔════╝██║   ██║████╗  ██║██╔════╝╚══██╔══╝██║██╔═══██╗████╗  ██║██╔════╝╚██╗
  //  ██║ █████╗  ██║   ██║██╔██╗ ██║██║        ██║   ██║██║   ██║██╔██╗ ██║███████╗ ██║
  //  ██║ ██╔══╝  ██║   ██║██║╚██╗██║██║        ██║   ██║██║   ██║██║╚██╗██║╚════██║ ██║
  //  ╚██╗██║     ╚██████╔╝██║ ╚████║╚██████╗   ██║   ██║╚██████╔╝██║ ╚████║███████║██╔╝
  //   ╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝
  //
  // If we are expecting either eachBatchFn or eachRecordFn, then make sure
  // one or the other is set... but not both!  And make sure that, whichever
  // one is specified, it is a function.
  //
  // > This is only a problem if BOTH `eachRecordFn` and `eachBatchFn` are
  // > left undefined, or if they are BOTH set.  (i.e. xor)
  // > See https://gist.github.com/mikermcneil/d1e612cd1a8564a79f61e1f556fc49a6#edge-cases--details
  if (_.contains(queryKeys, 'eachRecordFn') || _.contains(queryKeys, 'eachBatchFn')) {

    // -> Both functions were defined
    if (!_.isUndefined(query.eachRecordFn) && !_.isUndefined(query.eachBatchFn)) {

      throw buildUsageError('E_INVALID_STREAM_ITERATEE',
        'Cannot specify both `eachRecordFn` and `eachBatchFn`-- please set one or the other.'
      );

    }
    // -> Only `eachRecordFn` was defined
    else if (!_.isUndefined(query.eachRecordFn)) {

      if (!_.isFunction(query.eachRecordFn)) {
        throw buildUsageError('E_INVALID_STREAM_ITERATEE',
          'For `eachRecordFn`, instead of a function, got: '+util.inspect(query.eachRecordFn,{depth:null})
        );
      }

    }
    // -> Only `eachBatchFn` was defined
    else if (!_.isUndefined(query.eachBatchFn)) {

      if (!_.isFunction(query.eachBatchFn)) {
        throw buildUsageError('E_INVALID_STREAM_ITERATEE',
          'For `eachBatchFn`, instead of a function, got: '+util.inspect(query.eachBatchFn,{depth:null})
        );
      }

    }
    // -> Both were left undefined
    else {

      throw buildUsageError('E_INVALID_STREAM_ITERATEE',
        'Either `eachRecordFn` or `eachBatchFn` should be defined, but neither of them are.'
      );

    }

  }//>-•





  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -




  //  ███╗   ██╗███████╗██╗    ██╗    ██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ██████╗
  //  ████╗  ██║██╔════╝██║    ██║    ██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔══██╗
  //  ██╔██╗ ██║█████╗  ██║ █╗ ██║    ██████╔╝█████╗  ██║     ██║   ██║██████╔╝██║  ██║
  //  ██║╚██╗██║██╔══╝  ██║███╗██║    ██╔══██╗██╔══╝  ██║     ██║   ██║██╔══██╗██║  ██║
  //  ██║ ╚████║███████╗╚███╔███╔╝    ██║  ██║███████╗╚██████╗╚██████╔╝██║  ██║██████╔╝
  //  ╚═╝  ╚═══╝╚══════╝ ╚══╝╚══╝     ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝
  if (_.contains(queryKeys, 'newRecord')) {

    try {
      query.newRecord = normalizeNewRecord(query.newRecord, query.using, orm, ensureTypeSafety);
    } catch (e) {
      switch (e.code){

        case 'E_INVALID':
        case 'E_MISSING_REQUIRED':
        case 'E_HIGHLY_IRREGULAR':
          throw buildUsageError('E_INVALID_NEW_RECORD', e.message);

        default: throw e;
      }
    }//</catch>

  }//>-•





  //  ███╗   ██╗███████╗██╗    ██╗    ██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ██████╗ ███████╗
  //  ████╗  ██║██╔════╝██║    ██║    ██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔══██╗██╔════╝
  //  ██╔██╗ ██║█████╗  ██║ █╗ ██║    ██████╔╝█████╗  ██║     ██║   ██║██████╔╝██║  ██║███████╗
  //  ██║╚██╗██║██╔══╝  ██║███╗██║    ██╔══██╗██╔══╝  ██║     ██║   ██║██╔══██╗██║  ██║╚════██║
  //  ██║ ╚████║███████╗╚███╔███╔╝    ██║  ██║███████╗╚██████╗╚██████╔╝██║  ██║██████╔╝███████║
  //  ╚═╝  ╚═══╝╚══════╝ ╚══╝╚══╝     ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝
  if (_.contains(queryKeys, 'newRecords')) {

    if (_.isUndefined(query.newRecords)) {
      throw buildUsageError('E_INVALID_NEW_RECORDS',
        'Please specify `newRecords` (required for this variety of query).'
      );
    }//-•

    if (!_.isArray(query.newRecords)) {
      throw buildUsageError('E_INVALID_NEW_RECORDS',
        'Expecting an array but instead, got: '+util.inspect(query.newRecords,{depth:null})
      );
    }//-•

    // Validate and normalize each new record in the provided array.
    query.newRecords = _.map(query.newRecords, function (newRecord){

      try {
        return normalizeNewRecord(newRecord, query.using, orm, ensureTypeSafety);
      } catch (e) {
        switch (e.code){

          case 'E_INVALID':
          case 'E_MISSING_REQUIRED':
          case 'E_HIGHLY_IRREGULAR':
            throw buildUsageError('E_INVALID_NEW_RECORDS',
              'Could not parse one of the provided new records.  Details: '+e.message
            );

          default: throw e;
        }
      }//</catch>

    });//</_.each()>

  }//>-•





  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -


  //  ██╗   ██╗ █████╗ ██╗     ██╗   ██╗███████╗███████╗
  //  ██║   ██║██╔══██╗██║     ██║   ██║██╔════╝██╔════╝
  //  ██║   ██║███████║██║     ██║   ██║█████╗  ███████╗
  //  ╚██╗ ██╔╝██╔══██║██║     ██║   ██║██╔══╝  ╚════██║
  //   ╚████╔╝ ██║  ██║███████╗╚██████╔╝███████╗███████║
  //    ╚═══╝  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝╚══════╝
  //
  //  ████████╗ ██████╗     ███████╗███████╗████████╗
  //  ╚══██╔══╝██╔═══██╗    ██╔════╝██╔════╝╚══██╔══╝
  //     ██║   ██║   ██║    ███████╗█████╗     ██║
  //     ██║   ██║   ██║    ╚════██║██╔══╝     ██║
  //     ██║   ╚██████╔╝    ███████║███████╗   ██║
  //     ╚═╝    ╚═════╝     ╚══════╝╚══════╝   ╚═╝
  if (_.contains(queryKeys, 'valuesToSet')) {

    if (!_.isObject(query.valuesToSet) || _.isFunction(query.valuesToSet) || _.isArray(query.valuesToSet)) {
      throw buildUsageError('E_INVALID_VALUES_TO_SET',
        'Expecting a dictionary (plain JavaScript object) but instead, got: '+util.inspect(query.valuesToSet,{depth:null})
      );
    }//-•

    // Now loop over and check every key specified in `valuesToSet`
    _.each(_.keys(query.valuesToSet), function (attrNameToSet){

      // Validate & normalize this value.
      try {
        query.valuesToSet[attrNameToSet] = normalizeValueToSet(query.valuesToSet[attrNameToSet], attrNameToSet, query.using, orm, ensureTypeSafety);
      } catch (e) {
        switch (e.code) {

          // If its RHS should be ignored (e.g. because it is `undefined`), then delete this key and bail early.
          case 'E_SHOULD_BE_IGNORED':
            delete query.valuesToSet[attrNameToSet];
            return;

          case 'E_HIGHLY_IRREGULAR':
            throw buildUsageError('E_INVALID_VALUES_TO_SET',
              'Problematic value specified for `'+attrNameToSet+'`: '+e.message
            );

          case 'E_INVALID':
            throw buildUsageError('E_INVALID_VALUES_TO_SET',
              'The value specified for `'+attrNameToSet+'` is the wrong type of data: '+e.message
            );

          default:
            throw e;
        }
      }//</catch>

    });//</_.each() key in the new record>

  }//>-•






  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -



  //  ████████╗ █████╗ ██████╗  ██████╗ ███████╗████████╗
  //  ╚══██╔══╝██╔══██╗██╔══██╗██╔════╝ ██╔════╝╚══██╔══╝
  //     ██║   ███████║██████╔╝██║  ███╗█████╗     ██║
  //     ██║   ██╔══██║██╔══██╗██║   ██║██╔══╝     ██║
  //     ██║   ██║  ██║██║  ██║╚██████╔╝███████╗   ██║
  //     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝
  //
  //  ██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ██████╗     ██╗██████╗ ███████╗
  //  ██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔══██╗    ██║██╔══██╗██╔════╝
  //  ██████╔╝█████╗  ██║     ██║   ██║██████╔╝██║  ██║    ██║██║  ██║███████╗
  //  ██╔══██╗██╔══╝  ██║     ██║   ██║██╔══██╗██║  ██║    ██║██║  ██║╚════██║
  //  ██║  ██║███████╗╚██████╗╚██████╔╝██║  ██║██████╔╝    ██║██████╔╝███████║
  //  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝     ╚═╝╚═════╝ ╚══════╝
  if (_.contains(queryKeys, 'targetRecordIds')) {

    // Normalize (and validate) the specified target record pk values.
    // (if a singular string or number was provided, this converts it into an array.)
    //
    // > Note that this ensures that they match the expected type indicated by this
    // > model's primary key attribute.
    try {
      var pkAttrDef = getAttribute(WLModel.primaryKey, query.using, orm);
      query.targetRecordIds = normalizePkValues(query.targetRecordIds, pkAttrDef.type);
    } catch(e) {
      switch (e.code) {

        case 'E_INVALID_PK_VALUE':
          throw buildUsageError('E_INVALID_TARGET_RECORD_IDS', e.message);

        default:
          throw e;

      }
    }//< / catch : normalizePkValues >


  }//>-•








  //   ██████╗ ██████╗ ██╗     ██╗     ███████╗ ██████╗████████╗██╗ ██████╗ ███╗   ██╗
  //  ██╔════╝██╔═══██╗██║     ██║     ██╔════╝██╔════╝╚══██╔══╝██║██╔═══██╗████╗  ██║
  //  ██║     ██║   ██║██║     ██║     █████╗  ██║        ██║   ██║██║   ██║██╔██╗ ██║
  //  ██║     ██║   ██║██║     ██║     ██╔══╝  ██║        ██║   ██║██║   ██║██║╚██╗██║
  //  ╚██████╗╚██████╔╝███████╗███████╗███████╗╚██████╗   ██║   ██║╚██████╔╝██║ ╚████║
  //   ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚══════╝ ╚═════╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
  //
  //   █████╗ ████████╗████████╗██████╗     ███╗   ██╗ █████╗ ███╗   ███╗███████╗
  //  ██╔══██╗╚══██╔══╝╚══██╔══╝██╔══██╗    ████╗  ██║██╔══██╗████╗ ████║██╔════╝
  //  ███████║   ██║      ██║   ██████╔╝    ██╔██╗ ██║███████║██╔████╔██║█████╗
  //  ██╔══██║   ██║      ██║   ██╔══██╗    ██║╚██╗██║██╔══██║██║╚██╔╝██║██╔══╝
  //  ██║  ██║   ██║      ██║   ██║  ██║    ██║ ╚████║██║  ██║██║ ╚═╝ ██║███████╗
  //  ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝    ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝
  // Look up the association by this name in this model definition.
  if (_.contains(queryKeys, 'collectionAttrName')) {

    if (!_.isString(query.collectionAttrName)) {
      throw buildUsageError('E_INVALID_COLLECTION_ATTR_NAME',
        'Instead of a string, got: '+util.inspect(query.collectionAttrName,{depth:null})
      );
    }

    // Validate that an association by this name actually exists in this model definition.
    var associationDef;
    try {
      associationDef = getAttribute(query.collectionAttrName, query.using, orm);
    } catch (e) {
      switch (e.code) {
        case 'E_ATTR_NOT_REGISTERED':
          throw buildUsageError('E_INVALID_COLLECTION_ATTR_NAME',
            'There is no attribute named `'+query.collectionAttrName+'` defined in this model.'
          );
        default: throw e;
      }
    }//</catch>

    // Validate that the association with this name is a collection association.
    if (!associationDef.collection) {
      throw buildUsageError('E_INVALID_COLLECTION_ATTR_NAME',
        'The attribute named `'+query.collectionAttrName+'` defined in this model is not a collection association.'
      );
    }

    // Implement the X's from the chart as fatal errors.
    // TODO

  }//>-•









  //   █████╗ ███████╗███████╗ ██████╗  ██████╗██╗ █████╗ ████████╗███████╗██████╗
  //  ██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔════╝██║██╔══██╗╚══██╔══╝██╔════╝██╔══██╗
  //  ███████║███████╗███████╗██║   ██║██║     ██║███████║   ██║   █████╗  ██║  ██║
  //  ██╔══██║╚════██║╚════██║██║   ██║██║     ██║██╔══██║   ██║   ██╔══╝  ██║  ██║
  //  ██║  ██║███████║███████║╚██████╔╝╚██████╗██║██║  ██║   ██║   ███████╗██████╔╝
  //  ╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝  ╚═════╝╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═════╝
  //
  //  ██╗██████╗ ███████╗
  //  ██║██╔══██╗██╔════╝
  //  ██║██║  ██║███████╗
  //  ██║██║  ██║╚════██║
  //  ██║██████╔╝███████║
  //  ╚═╝╚═════╝ ╚══════╝
  if (_.contains(queryKeys, 'associatedIds')) {

    // Look up the ASSOCIATED Waterline model for this query, based on the `collectionAttrName`.
    // Then use that to look up the declared type of its primary key.
    //
    // > Note that, if there are any problems that would prevent us from doing this, they
    // > should have already been caught above, and we should never have made it to this point
    // > in the code.  So i.e. we can proceed with certainty that the model will exist.
    // > And since its definition will have already been verified for correctness when
    // > initializing Waterline, we can safely assume that it has a primary key, etc.
    var associatedPkType = (function(){
      var _associationDef = getAttribute(query.collectionAttrName, query.using, orm);
      var _otherModelIdentity = _associationDef.collection;
      var AssociatedModel = getModel(_otherModelIdentity, orm);
      var _associatedPkDef = getAttribute(AssociatedModel.primaryKey, _otherModelIdentity, orm);
      return _associatedPkDef.type;
    })();

    // Validate the provided set of associated record ids.
    // (if a singular string or number was provided, this converts it into an array.)
    //
    // > Note that this ensures that they match the expected type indicated by this
    // > model's primary key attribute.
    try {
      query.associatedIds = normalizePkValues(query.associatedIds, associatedPkType);
    } catch(e) {
      switch (e.code) {

        case 'E_INVALID_PK_VALUE':
          throw buildUsageError('E_INVALID_ASSOCIATED_IDS', e.message);

        default:
          throw e;

      }
    }//< / catch :: normalizePkValues >

  }//>-•




  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
  //-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -
  // console.timeEnd('forgeStageTwoQuery');


  // --
  // The provided "stage 1 query guts" dictionary is now a logical protostatement ("stage 2 query").
  //
  // Do not return anything.
  return;

};







/**
 * To quickly do an ad-hoc test of this utility from the Node REPL...
 * (~7ms latency, Nov 22, 2016)
 */

/*```
q = { using: 'user', method: 'find', criteria: {where: {id: '3d'}, limit: 3} };  require('./lib/waterline/utils/query/forge-stage-two-query')(q, { collections: { user: { attributes: { id: { type: 'string', required: true, unique: true } }, primaryKey: 'id', hasSchema: false } } }); console.log(util.inspect(q,{depth:null}));
```*/



/**
 * Now a slightly more complex example...
 * (~8ms latency, Nov 22, 2016)
 */

/*```
q = { using: 'user', method: 'find', populates: {pets: {}}, criteria: {where: {id: '3d'}, limit: 3} };  require('./lib/waterline/utils/query/forge-stage-two-query')(q, { collections: { user: { attributes: { id: { type: 'string', required: true, unique: true }, pets: { collection: 'pet' } }, primaryKey: 'id', hasSchema: false }, pet: { attributes: { id: { type:'number', required: true, unique: true } }, primaryKey: 'id', hasSchema: true } } }); console.log(util.inspect(q,{depth:null}));
```*/



/**
 * Now a simple `create`...
 */

/*```
q = { using: 'user', method: 'create', newRecord: { id: 3, age: 32, foo: 4 } };  require('./lib/waterline/utils/query/forge-stage-two-query')(q, { collections: { user: { attributes: { id: { type: 'string', required: true, unique: true }, age: { type: 'number', required: false }, foo: { type: 'string', required: true }, pets: { collection: 'pet' } }, primaryKey: 'id', hasSchema: true}, pet: { attributes: { id: { type:'number', required: true, unique: true } }, primaryKey: 'id', hasSchema: true } } }); console.log(util.inspect(q,{depth:null}));
```*/



/**
 * Now a simple `update`...
 */

/*```
q = { using: 'user', method: 'update', valuesToSet: { id: 3, age: 32, foo: 4 } };  require('./lib/waterline/utils/query/forge-stage-two-query')(q, { collections: { user: { attributes: { id: { type: 'string', required: true, unique: true }, age: { type: 'number', required: false }, foo: { type: 'string', required: true }, pets: { collection: 'pet' } }, primaryKey: 'id', hasSchema: true}, pet: { attributes: { id: { type:'number', required: true, unique: true } }, primaryKey: 'id', hasSchema: true } } }); console.log(util.inspect(q,{depth:null}));
```*/



/**
 * Mongo-style `sort` clause semantics...
 */

/*```
q = { using: 'user', method: 'update', criteria: { sort: { age: -1 } }, valuesToSet: { id: 'wat', age: null, foo: 4 } };  require('./lib/waterline/utils/query/forge-stage-two-query')(q, { collections: { user: { attributes: { id: { type: 'string', required: true, unique: true }, age: { type: 'number', required: false, defaultsTo: 99 }, foo: { type: 'string', required: true }, pets: { collection: 'pet' } }, primaryKey: 'id', hasSchema: true}, pet: { attributes: { id: { type:'number', required: true, unique: true } }, primaryKey: 'id', hasSchema: true } } }); console.log(util.inspect(q,{depth:null}));
```*/


/**
 * `where` fracturing...
 */

/*```
q = { using: 'user', method: 'find', criteria: {where: {id: '3d', foo: 'bar'}, limit: 3} };  require('./lib/waterline/utils/query/forge-stage-two-query')(q, { collections: { user: { attributes: { id: { type: 'string', required: true, unique: true } }, primaryKey: 'id', hasSchema: false } } }); console.log(util.inspect(q,{depth:null}));
```*/

/**
 * to demonstrate that you cannot both populate AND sort by an attribute at the same time...
 */

/*```
q = { using: 'user', method: 'find', populates: {mom: {}, pets: { sort: [{id: 'DESC'}] }}, criteria: {where: {}, limit: 3, sort: 'mom ASC'} };  require('./lib/waterline/utils/query/forge-stage-two-query')(q, { collections: { user: { attributes: { id: { type: 'string', required: true, unique: true }, mom: { model: 'user' }, pets: { collection: 'pet' } }, primaryKey: 'id', hasSchema: false }, pet: { attributes: { id: { type:'number', required: true, unique: true } }, primaryKey: 'id', hasSchema: true } } }); console.log(util.inspect(q,{depth:null}));
```*/

/**
 * to demonstrate that you cannot sort by a plural association...
 */

/*```
q = { using: 'user', method: 'find', populates: {pets: { sort: [{id: 'DESC'}] }}, criteria: {where: {and: [{id: '3d'}, {or: [{id: 'asdf'}]} ]}, limit: 3, sort: 'pets asc'} };  require('./lib/waterline/utils/query/forge-stage-two-query')(q, { collections: { user: { attributes: { id: { type: 'string', required: true, unique: true }, pets: { collection: 'pet' } }, primaryKey: 'id', hasSchema: false }, pet: { attributes: { id: { type:'number', required: true, unique: true } }, primaryKey: 'id', hasSchema: true } } }); console.log(util.inspect(q,{depth:null}));
```*/
