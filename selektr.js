/**
 * Selectron assists in counting selection caret's offset in relation to
 * different DOM elements, and saving and restoring selection ranges. Saving
 * and restoring of selection/ranges will work across heavy DOM manipulation if used correctly.
 *
 * @module spytext/selectron 
 */

/**
 * Position of a caret (start or end)
 *
 * @typedef {Object} Position
 * @property {Node} ref - Reference node to count `offset` from
 * @property {number} offset - Steps from start of `ref`
 */

/**
 * Positions of start and end caret
 *
 * @typedef {Object} Positions
 * @property {Position} start - Position of start caret
 * @property {Position} end - Position of end caret
 */

var isArray = require('lodash/isArray'),
	toArray = require('lodash/toArray'),
	uniq = require('lodash/uniq'),
	head = require('lodash/head'),
	last = require('lodash/last'),
	isString = require('lodash/isString'),
	isObject = require('lodash/isObject');

var ancestors = require('dollr/ancestors');
var children = require('dollr/children');
var closest = require('dollr/closest');
var is = require('dollr/is');
	
var sectionTags = [ 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI' ];      

/**
 * Tests whether `node` is a section element, ie if it is of nodeType 1
 * and its tagName is in `sectionTags`.
 *
 * @param	{Node} node - The node to check if it is a section element
 * @return {boolean}
 */
function isSection(node) {
	return node.nodeType === 1 && sectionTags.indexOf(node.tagName) !== -1;
	//return node.nodeType === 1 && !getComputedStyle(node).display.match(/inline/);
}

function filter(node) {
	// TODO remove jQuery dependencies
	return (!is(node, 'UL,OL') && (node.nodeName !== 'BR' || node.nextSibling && !is(node.nextSibling, 'UL,OL'))) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
}

filter.acceptNode = filter;

/**
 * Uses a TreeWalker to traverse and count the offset from `root` to `ref`. A treeWalker is used
 * because we use `currentNode` which is not available on NodeIterator
 *
 * This is essentially the inverse of restore
 *
 * @static
 * @param	{Node} root - Element to count relative
 * @param	{Node} ref - Element to reach
 * @param	{boolean} [countAll] - Boolean parameter to determine whether to count all steps
 * @return {number}	The total offset of the caret relative to element
 */
function count(root, ref, countAll) {
	var node,
		off = 0,
		tw = document.createTreeWalker(root, NodeFilter.SHOW_ALL, countAll ? null : filter, false);

	// the following use of currentNode prohibits us from using a NodeIterator
	// instead of a TreeWalker
	if(ref) {
		tw.currentNode = ref;
	}

	node = tw.currentNode;

	while(node) {
		if(node !== root && (countAll || isSection(node) || node.nodeName === 'BR'))
			off++;

		if(node !== ref && node.nodeType === 3)
			off = off + node.textContent.length;

		node = ref ? tw.previousNode() : tw.nextNode();
	}

	return off;
}

/**
 * Return the total offset for a caret (start or end) of a range relative to a
 * specific element
 *
 * @static
 * @param	{Element} element - Containing element to count offset relative to
 * @param	{string} [caret=start] - Parameter that determines whether we should fetch start or endContainer
 * @param	{boolean} [countAll] - Boolean parameter to determine whether to count all elements
 * @return {number}	The total offset of the caret relative to `element`
 * @see count	
 */
function offset(element, caret, countAll) {
	var rng = s().getRangeAt(0),
		ref = rng[(caret || 'end') + 'Container'],
		off = rng[(caret || 'end') + 'Offset'];

	element = element || closest(ref, sectionTags.join(','));

	if(ref.nodeType === 1 && off > 0) {
		ref = ref.childNodes[off - 1];
		off = ref.textContent.length;
	}

	return count(element, ref, countAll) + off;
}

/**
 * Uses `root` and `offset` to traverse the DOM to find the innermost element
 * where the caret should be placed.
 *
 * This is essentially the inverse of count
 *
 * @static
 * @param	{Element} root
 * @param	{number} offset
 * @param	{boolean} [countAll] - Boolean parameter to determine whether to count all elements
 * @return {Position}
 */
function uncount(root, offset, countAll) {
	offset = offset || 0;

	var node,
		ref = root;

	// IE fix. IE does not allow treeWalkers to be created on textNodes
	if(root.nodeType === 1) {
		tw = document.createTreeWalker(root, NodeFilter.SHOW_ALL, countAll ? null : filter, false);

		while((node = tw.nextNode())) {
			if(countAll || isSection(node) || node.nodeName === 'BR') {
				if(offset === 0)
					break;

				offset--;
			}

			ref = node;

			if(node.nodeType === 3) {
				if(offset > node.textContent.length)
					offset = offset - node.textContent.length;
				else
					break;
			}
		}
	}

	if(ref.nodeName === 'BR') {
		offset = toArray(ref.parentNode.childNodes).indexOf(ref) + 1;
		ref = ref.parentNode;
	}

	return {
		ref: ref,
		offset: offset
	};
}

var descendants = require('descendants');

var s = window.getSelection;

module.exports = {
	uncount: uncount,

	count: count,

	offset: offset,

	/**
	 * Returns all elements contained by the current selection
	 *
	 * @param	{Element} element - Element to count relative
	 * @param	{Node[]|NodeList|string|number|function} [ufo] - Filters
	 * @param	{number} [levels] - How many levels of descendants should be collected. If `levels` is not set, all levels will be traversed
	 * @param	{boolean} [partlyContained] - How many levels of descendants should be collected. If `levels` is not set, all levels will be traversed
	 * @param	{boolean} [onlyDeepest] - How many levels of descendants should be collected. If `levels` is not set, all levels will be traversed
	 * @return {Node[]}	Array contained all contained nodes
	 */
	contained: function(opts, partlyContained) {
		opts = opts || {};

		var _selectron = this,
			check,
			nodes = [],
			element = opts.element || this._element || document.body;

		if(isArray(opts))
			check = opts;
		else if(opts instanceof NodeList || opts instanceof HTMLCollection || opts instanceof jQuery)
			check = toArray(opts);
		else {
			if(opts.sections) opts = { selector: sectionTags.join(',') };
			check = descendants(element, opts);
		}
			
		// loop through all nodes and check if
		// they are contained by the current selection
		check.forEach(function(node) {
			if(_selectron.contains(node, partlyContained))
				nodes.push(node);
		});

		// return any contained nodes
		return nodes;
	},

	/**
	 * Tests whether `node` is contained by the current selection
	 *
	 * @param	{Node} node - Element to count relative
	 * @param	{boolean} [partlyContained] - Return nodes that are not completely contained by selection
	 * @return {boolean}
	 */
	contains: function(node, partlyContained) {
		// default, unoverridable behaviour of Selection.containsNode() for textNodes
		// is to always test partlyContained = true
		partlyContained = node.nodeType === 3 ? true : !!partlyContained;

		var sel = s();

		if(sel.containsNode) {
			// simply use Selection objects containsNode native function if it exists
			return sel.containsNode(node, partlyContained);
		} else {
			var rng = sel.getRangeAt(0),
				element = rng.commonAncestorContainer;

			if(element.nodeType !== 1) {
				element = element.parentNode;
			}

		
			if(element !== node && !element.contains(node)) {
				return partlyContained && node.contains(element);
			}
			
			var rangeStartOffset = offset(element, 'start', true),
				rangeEndOffset = offset(element, 'end', true),
				startOffset = count(element, node, true),
				endOffset = node.nodeType === 1 ? startOffset + count(node, null, true) + 1 : startOffset + node.textContent.length;

			return (startOffset >= rangeStartOffset && endOffset <= rangeEndOffset ||
					(partlyContained && ((rangeStartOffset >= startOffset && rangeStartOffset <= endOffset) || (rangeEndOffset >= startOffset && rangeEndOffset <= endOffset))));
		}
	},

	/**
	 * Tests whether all `nodes` are contained by the current selection
	 *
	 * @param	{Node[]} nodes - nodes to test if they are contained
	 * @param	{boolean} [partlyContained] - Return nodes that are not completely contained by selection
	 * @return {boolean}
	 * @see contains
	 */
	containsEvery: function(nodes, partlyContained) {
		var that = this;

		return toArray(nodes).every(function(node) {
			return that.contains(node, partlyContained);
		});
	},

	/**
	 * Tests whether any of `nodes` are contained by the current selection
	 *
	 * @param	{Node[]} nodes - nodes to test if they are contained
	 * @param	{boolean} [partlyContained] - Return nodes that are not completely contained by selection
	 * @return {boolean}
	 * @see contains
	 */
	containsSome: function(nodes, partlyContained) {
		var that = this;

		return toArray(nodes).some(function(node) {
			return that.contains(node, partlyContained);
		});

	},

	normalize: function() {
		var rng = this.range(),
			section;

		if(!rng.collapsed) {
			// prevent selection to include next section tags when selecting
			// to the end of a section
			if(is(rng.endContainer, sectionTags.join(',')) && rng.endOffset === 0) {
				var ref = rng.endContainer;

				// TODO this looks like it could potentially be dangerous
				while(!ref.previousSibling)
					ref = ref.parentNode;

				section = closest(rng.startContainer, sectionTags.join(','));

				this.restore({
					start: this.get('start', section),
					end: {
						ref: ref.previousSibling,
						offset: count(ref.previousSibling)
					}
				});
			}
		} else {
			// ensure similar behaviour in all browers when using arrows or using mouse to move caret.
			if(rng.endContainer.nodeType === 3 && rng.endOffset === 0) {
				section = closest(rng.endContainer, sectionTags.join(','));

				this.restore(this.get('end', section));
			}
		}
	},

	/**
	 * Return the current selection's (first) range
	 *
	 * @return {Range}
	 */
	range: function() {
		// retrieve the current selection
		var sel = s();

		if(sel.rangeCount > 0)
			// selection has at least one range, return the first
			return sel.getRangeAt(0);
		else
			// selection has no range, return null
			return null;
	},

	/**
	 * Tests whether the caret is currently at the end of a section
	 *
	 * @return {boolean}
	 */
	isAtEndOfSection: function(section) {
		var endContainer = this.range().endContainer;

		if(section) {
			if(section !== endContainer && !section.contains(endContainer))
				return false;
		} else {
			section = closest(endContainer, sectionTags.join(','));
		}

		var off = offset(section, 'end'),
			nestedList = children(section, 'UL,OL'),
			// TODO maybe skip check here... ie check if second arg is null in count instaed
			result = nestedList.length > 0 ? count(section, nestedList[0]) : count(section);

		return off === result;
	},

	/**
	 * Tests whether the caret is currently at the end of a section
	 *
	 * @return {boolean}
	 */
	isAtStartOfSection: function(section) {
		var section = section || closest(this.range().startContainer, sectionTags.join(','));

		return offset(section, 'start') === 0;
	},

	/**
	 * Get Positions of start and end caret of current selection
	 *
	 * @param {Element} [element=document.body] - The reference node (to count the offset from)
	 * @param	{boolean} [countAll] - Boolean parameter to determine whether to count all steps
	 * @return {Positions} ref element of both start and end Position will be `element`
	 */
	get: function(caret, element, countAll) {
		var rng = this.range();

		if(!isString(caret)) {
			var end = this.get('end', caret, element);

			// we base start on end instead of vice versa
			// because IE treats startOffset very weird sometimes
			return {
				end: end,
				start: rng.collapsed ? end : this.get('start', caret, element)
			};
		} else if (caret !== 'start' && caret !== 'end') {
			throw new Error('You have to pass "start" or "end" if you pass a string as the first parameter');
		}

		if(element === true) {
			return {
				ref: rng[ caret + 'Container' ],
				offset: rng[ caret + 'Offset' ]
			};
		}

		element = element || this._element || document.body;

		if(element === this._element && this._positions)
			return this._positions[ caret ];

		return {
			ref: element,
			offset: offset(element, caret, countAll)
		};
	},

	/**
	 * Sets the current selection to contain `node`
	 *
	 * @param {Node} node - The node to select
	 */
	select: function(node) {
		var textNodes = node.nodeType === 3 ? [ node ] : descendants(node, { nodeType: 3 });

		if(textNodes.length === 0) {
			this.set({ ref: node, offset: 0 });
		} else {
			var f = head(textNodes),
				l = last(textNodes);

			this.set({
				start: {
					ref: f,
					offset: 0
				},
				end: {
					ref: l,
					offset: l.textContent.length,
				}
			});
		}
	},

	/**
	 * Sets the selection to `position`
	 *
	 * @param {Position|Positions} position - If a Position, a collapsed range will be set with start and end caret set to `position`
	 */
	restore: function(positions, update) {
		if(positions.ref) {
			positions = {
				start: positions,
				end: positions
			};
		} else
			positions.end = positions.end || positions.start;

		var start = uncount(positions.start.ref, positions.start.offset),
			end = positions.end !== positions.start ? uncount(positions.end.ref, positions.end.offset) : start;

		this.set({ start: start, end: end });
		
		if(update)
			this.update(positions);
	},

	set: function(positions, update) {
		var start, end;

		if(positions.ref) {
			start = end = positions;
		} else {
			start = positions.start;
			end = positions.end || positions.start;
		}

		if((start.ref.nodeType === 1 && start.offset > start.ref.childNodes.length || start.ref.nodeType !== 1 && start.offset > start.ref.textContent.length) ||
				(end.ref.nodeType === 1 && end.offset > end.ref.childNodes.length || end.ref.nodeType !== 1 && end.offset > end.ref.textContent.length))
			return;
		
		var rng = document.createRange(),
			sel = s();

		rng.setStart(start.ref, start.offset || 0);
		rng.setEnd(end.ref, end.offset || 0);

		sel.removeAllRanges();
		sel.addRange(rng);

		if(update)
			this.update();
	},

	setElement: function(element) {
		this._element = element;
	},
	
	update: function(positions, updateContained, updateStyles) {
		if(isObject(positions)) {
			this._positions = positions.ref ? {
				start: positions,
				end: positions
			} : positions;
		} else if (positions !== false) {
			delete this._positions;
			this._positions = this.get();
		}

		if(updateContained !== false)
			this.updateContained();

		if(updateStyles !== false)
			this.updateStyles();
	},

	updateStyles: function() {
		var _selectron = this;

		var formats = [ 'strong', 'u', 'em', 'strike' ];
	
		this.styles = {};

		this.styles.alignment = this.contained.blocks.reduce(function(result, block) {
			if(result === undefined) return result;

			var newResult = getComputedStyle(block).textAlign;

			if(newResult === 'start') newResult = 'left'; 

			if(result === null) result = newResult;

			return result === newResult ? newResult : undefined;
		}, null);

		this.styles.formats = [];

		var textNodes = _selectron.contained.textNodes;

		this.styles.blocks = uniq(_selectron.contained.blocks.map(function(node) {
			return node.nodeName;
		}));

		formats.forEach(function(tag) {
			var rng = _selectron.range();
			if((textNodes.length > 0 && textNodes.every(function(node) {
				return ancestors(node, null, _selectron.element).some((element) => element.matches(tag)); 
			})) ||
				rng.collapsed && (is(rng.startContainer, tag) ||
				ancestors(rng.startContainer, null, _selectron.element).some((element) => element.matches(tag)))) {

				_selectron.styles.formats.push(tag);
			}
		});
	},

	updateContained: function() {
		var _selectron = this;
		
		this.contained.sections = this.contained({ sections: true }, true);

		this.contained.listItems = uniq(this.contained.sections.filter(function(node) {
			return node.nodeName === 'LI';
		}));

		this.contained.lists = this.contained(children(this._element, 'UL,OL'), true);

		this.contained.blocks = this.contained.sections.filter(function(node) {
			return node.nodeName !== 'LI';
		});

		var commonAncestor = this.range().commonAncestorContainer;

		this.contained.textNodes = commonAncestor.nodeType === 3 ? [ commonAncestor ] : this.contained({ element: commonAncestor, nodeType: 3 }, true);
	}
};
