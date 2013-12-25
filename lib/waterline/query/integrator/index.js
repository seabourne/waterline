/**
 * Module dependencies
 */
var anchor = require('anchor');
var _ = require('lodash');
var leftOuterJoin = require('./leftOuterJoin');
var innerJoin = require('./innerJoin');
var populate = require('./populate');



/**
 * Query Integrator
 *
 * Combines the results from multiple child queries into
 * the final return format using an in-memory join.
 * Final step in fulfilling a `.find()` with one or more
 * `populate(alias[n])` modifiers.
 *
 *    > Why is this asynchronous?
 *    >
 *    > While this function isn't doing anything strictly
 *    > asynchronous, it still expects a callback to enable
 *    > future use of `process[setImmediate|nextTick]()` as
 *    > a potential optimization.
 * 
 * @param  {Object}   cache
 * @param  {Array}    joinInstructions      - see JOIN_INSTRUCTIONS.md
 * @callback  {Function} cb(err, results)
 *           @param {Error}
 *           @param {Array}  [results, complete w/ populations]
 *
 * @throws {Error} on invalid input
 * @asynchronous
 */
module.exports = function integrate(cache, joinInstructions, cb) {  

  // Ensure valid usage
  var invalid = false;
  invalid = invalid || anchor(cache).to({ type: 'object' });
  invalid = invalid || anchor(joinInstructions).to({ type: 'array' });
  invalid = invalid || anchor(joinInstructions[0]).to({ type: 'object' });
  invalid = invalid || anchor(joinInstructions[0].parent).to({ type: 'string' });
  invalid = invalid || anchor(cache[joinInstructions[0].parent]).to({ type: 'object' });
  invalid = invalid || typeof cb !== 'function';
  if (invalid) return cb(invalid);




  // Nab the name of the parent table and parentKey from the first join so we
  // know our starting point.
  // 
  // (the parent table, the calling Model, `big daddy`, etc.)
  var parent = joinInstructions[0].parent;
  var parentPK = joinInstructions[0].parentKey;
  var parentAttributeNames = Object.keys(cache[parent][0]);

  // Set up initial `results` as the starting values of the parent table
  // (i.e. "big daddy") in the cache.
  var results = cache[parent];


  // Group the joinInstructions array by alias, then interate over each one
  // s.t. `instructions` in our lambda function contains a list of join instructions
  // for the particular `populate` on the specified key (i.e. alias).
  // 
  // Below, `results` are mutated inline.
  _.each( _.groupBy(joinInstructions, 'alias'),
    function eachAssociation( instructions, alias ) {

      var joinedResults;
    
      // N..N Association
      if ( instructions.length === 2 ) {

        // Calculate and sanitize join data,
        // then shove it into the parent results under `alias`
        populate({
          parentRows: results,
          alias: alias,

          childRows: innerJoin({
            left: leftOuterJoin({
              left: cache[instructions[0].parent],
              right: cache[instructions[0].child],
              leftKey: instructions[0].parentKey,
              rightKey: instructions[0].childKey
            }),
            right: cache[instructions[1].child],
            leftKey: instructions[1].parentKey,
            rightKey: instructions[1].childKey
          }),

          parentPK: instructions[0].parentKey,
          childPK: instructions[1].childKey,
          fkToChild: instructions[1].parentKey
        });
      }

      // 1..N Association
      else if ( instructions.length === 1 ) {
      
        // Calculate and sanitize join data,
        // then shove it into the parent results under `alias`
        populate({
          parentRows: results,
          alias: alias,

          childRows: innerJoin({
            left: cache[instructions[0].parent],
            right: cache[instructions[0].child],
            leftKey: instructions[0].parentKey,
            rightKey: instructions[0].childKey
          }),
          
          parentPK: instructions[0].parentKey,
          fkToChild: instructions[0].childKey,

          // TODO: look this up from schema--
          // we don't know it from join syntax
          childPK: '??????'
        });
      }

    }
  );


  // And call the callback
  // (the final joined data is in the cache -- also referenced by `results`)
  return cb(null, results);

};


