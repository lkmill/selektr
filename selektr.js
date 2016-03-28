'use strict';
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

const isArray = require('lodash/isArray');
const toArray = require('lodash/toArray');
const uniq = require('lodash/uniq');
const head = require('lodash/head');
const last = require('lodash/last');
const isString = require('lodash/isString');
const isObject = require('lodash/isObject');

const ancestors = require('dollr/ancestors');
const children = require('dollr/children');
const closest = require('dollr/closest');
const is = require('dollr/is');

const descendants = require('descendants');

const s = window.getSelection;

const sectionTags = [ 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI' ];

/**
 * Tests whether `node` is a section element, ie if it is of nodeType 1
 * and its tagName is in `sectionTags`.
 *
 * @param	{Node} node - The node to check if it is a section element
 * @return {boolean}
 */
function isSection(node) {
	return node.nodeType === 1 && sectionTags.indexOf(node.tagName) !== -1;
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
	let node;
	let off = 0;
	const tw = document.createTreeWalker(root, NodeFilter.SHOW_ALL, countAll ? null : filter, false);

	// the following use of currentNode prohibits us from using a NodeIterator
	// instead of a TreeWalker
	if (ref) {
		tw.currentNode = ref;
	}

	node = tw.currentNode;

	while (node) {
		if (node !== root && (countAll || isSection(node) || node.nodeName === 'BR'))
			off++;

		if (node !== ref && node.nodeType === 3)
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
	const rng = s().getRangeAt(0);
	let ref = rng[(caret || 'end') + 'Container'];
	let off = rng[(caret || 'end') + 'Offset'];

	element = element || closest(ref, sectionTags.join(','));

	if (ref.nodeType === 1 && off > 0) {
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
function uncount(root, off, countAll) {
	off = off || 0;

	let node;
	let ref = root;

	// IE fix. IE does not allow treeWalkers to be created on textNodes
	if (root.nodeType === 1) {
		const tw = document.createTreeWalker(root, NodeFilter.SHOW_ALL, countAll ? null : filter, false);

		while ((node = tw.nextNode())) {
			if (countAll || isSection(node) || node.nodeName === 'BR') {
				if (off === 0)
					break;

				off--;
			}

			ref = node;

			if (node.nodeType === 3) {
				if (off > node.textContent.length)
					off = off - node.textContent.length;
				else
					break;
			}
		}
	}

	if (ref.nodeName === 'BR') {
		off = toArray(ref.parentNode.childNodes).indexOf(ref) + 1;
		ref = ref.parentNode;
	}

	return {
		ref,
		offset: off
	};
}
module.exports = {
	uncount,

	count,

	offset,

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
	contained(opts, partlyContained) {
		opts = opts || {};

		let check;
		const nodes = [];
		const element = opts.element || this._element || document.body;

		if (isArray(opts))
			check = opts;
		else if (opts instanceof NodeList || opts instanceof HTMLCollection)
			check = toArray(opts);
		else {
			if (opts.sections) opts = { selector: sectionTags.join(',') };
			check = descendants(element, opts);
		}

		// loop through all nodes and check if
		// they are contained by the current selection
		check.forEach((node) => {
			if (this.contains(node, partlyContained))
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
	contains(node, partlyContained) {
		// default, unoverridable behaviour of Selection.containsNode() for textNodes
		// is to always test partlyContained = true
		partlyContained = node.nodeType === 3 ? true : !!partlyContained;

		const sel = s();

		if (sel.containsNode) {
			// simply use Selection objects containsNode native function if it exists
			return sel.containsNode(node, partlyContained);
		}

		const rng = sel.getRangeAt(0);
		let element = rng.commonAncestorContainer;

		if (element.nodeType !== 1) {
			element = element.parentNode;
		}

		if (element !== node && !element.contains(node)) {
			return partlyContained && node.contains(element);
		}

		const rangeStartOffset = offset(element, 'start', true);
		const rangeEndOffset = offset(element, 'end', true);
		const startOffset = count(element, node, true);
		const endOffset = node.nodeType === 1 ? startOffset + count(node, null, true) + 1 : startOffset + node.textContent.length;

		return (startOffset >= rangeStartOffset && endOffset <= rangeEndOffset ||
				(partlyContained && ((rangeStartOffset >= startOffset && rangeStartOffset <= endOffset) || (rangeEndOffset >= startOffset && rangeEndOffset <= endOffset))));
	},

	/**
	 * Tests whether all `nodes` are contained by the current selection
	 *
	 * @param	{Node[]} nodes - nodes to test if they are contained
	 * @param	{boolean} [partlyContained] - Return nodes that are not completely contained by selection
	 * @return {boolean}
	 * @see contains
	 */
	containsEvery(nodes, partlyContained) {
		return toArray(nodes).every((node) => this.contains(node, partlyContained));
	},

	/**
	 * Tests whether any of `nodes` are contained by the current selection
	 *
	 * @param	{Node[]} nodes - nodes to test if they are contained
	 * @param	{boolean} [partlyContained] - Return nodes that are not completely contained by selection
	 * @return {boolean}
	 * @see contains
	 */
	containsSome(nodes, partlyContained) {
		return toArray(nodes).some((node) => this.contains(node, partlyContained));
	},

	normalize() {
		const rng = this.range();
		let section;

		if (!rng.collapsed) {
			// prevent selection to include next section tags when selecting
			// to the end of a section
			if (is(rng.endContainer, sectionTags.join(',')) && rng.endOffset === 0) {
				let ref = rng.endContainer;

				// TODO this looks like it could potentially be dangerous
				while (!ref.previousSibling)
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
			if (rng.endContainer.nodeType === 3 && rng.endOffset === 0) {
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
	range() {
		// retrieve the current selection
		const sel = s();

		if (sel.rangeCount > 0)
			// selection has at least one range, return the first
			return sel.getRangeAt(0);

		// selection has no range, return null
		return null;
	},

	/**
	 * Tests whether the caret is currently at the end of a section
	 *
	 * @return {boolean}
	 */
	isAtEndOfSection(section) {
		const endContainer = this.range().endContainer;

		if (section) {
			if (section !== endContainer && !section.contains(endContainer))
				return false;
		} else {
			section = closest(endContainer, sectionTags.join(','));
		}

		const off = offset(section, 'end');
		const nestedList = children(section, 'UL,OL');
			// TODO maybe skip check here... ie check if second arg is null in count instaed
		const result = nestedList.length > 0 ? count(section, nestedList[0]) : count(section);

		return off === result;
	},

	/**
	 * Tests whether the caret is currently at the end of a section
	 *
	 * @return {boolean}
	 */
	isAtStartOfSection(section) {
		section = section || closest(this.range().startContainer, sectionTags.join(','));

		return offset(section, 'start') === 0;
	},

	/**
	 * Get Positions of start and end caret of current selection
	 *
	 * @param {Element} [element=document.body] - The reference node (to count the offset from)
	 * @param	{boolean} [countAll] - Boolean parameter to determine whether to count all steps
	 * @return {Positions} ref element of both start and end Position will be `element`
	 */
	get(caret, element, countAll) {
		const rng = this.range();

		if (!isString(caret)) {
			const end = this.get('end', caret, element);

			// we base start on end instead of vice versa
			// because IE treats startOffset very weird sometimes
			return {
				end,
				start: rng.collapsed ? end : this.get('start', caret, element)
			};
		} else if (caret !== 'start' && caret !== 'end') {
			throw new Error('You have to pass "start" or "end" if you pass a string as the first parameter');
		}

		if (element === true) {
			return {
				ref: rng[caret + 'Container'],
				offset: rng[caret + 'Offset']
			};
		}

		element = element || this._element || document.body;

		if (element === this._element && this._positions)
			return this._positions[caret];

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
	select(node) {
		const textNodes = node.nodeType === 3 ? [ node ] : descendants(node, { nodeType: 3 });

		if (textNodes.length === 0) {
			this.set({ ref: node, offset: 0 });
		} else {
			const f = head(textNodes);
			const l = last(textNodes);

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
	restore(positions, update) {
		if (positions.ref) {
			positions = {
				start: positions,
				end: positions
			};
		} else
			positions.end = positions.end || positions.start;

		const start = uncount(positions.start.ref, positions.start.offset);
		const end = positions.end !== positions.start ? uncount(positions.end.ref, positions.end.offset) : start;

		this.set({ start, end });

		if (update)
			this.update(positions);
	},

	set(positions, update) {
		let start;
		let end;

		if (positions.ref) {
			start = end = positions;
		} else {
			start = positions.start;
			end = positions.end || positions.start;
		}

		if ((start.ref.nodeType === 1 && start.offset > start.ref.childNodes.length || start.ref.nodeType !== 1 && start.offset > start.ref.textContent.length) ||
				(end.ref.nodeType === 1 && end.offset > end.ref.childNodes.length || end.ref.nodeType !== 1 && end.offset > end.ref.textContent.length))
			return;

		const rng = document.createRange();
		const sel = s();

		rng.setStart(start.ref, start.offset || 0);
		rng.setEnd(end.ref, end.offset || 0);

		sel.removeAllRanges();
		sel.addRange(rng);

		if (update)
			this.update();
	},

	setElement(element) {
		this._element = element;
	},

	update(positions, updateContained, updateStyles) {
		if (isObject(positions)) {
			this._positions = positions.ref ? {
				start: positions,
				end: positions
			} : positions;
		} else if (positions !== false) {
			delete this._positions;
			this._positions = this.get();
		}

		if (updateContained !== false)
			this.updateContained();

		if (updateStyles !== false)
			this.updateStyles();
	},

	updateStyles() {
		const formats = [ 'strong', 'u', 'em', 'strike' ];

		this.styles = {};

		this.styles.alignment = this.contained.blocks.reduce((result, block) => {
			if (result === undefined) return result;

			let newResult = getComputedStyle(block).textAlign;

			if (newResult === 'start') newResult = 'left';

			if (result === null) result = newResult;

			return result === newResult ? newResult : undefined;
		}, null);

		this.styles.formats = [];

		const textNodes = this.contained.textNodes;

		this.styles.blocks = uniq(this.contained.blocks.map((node) => node.nodeName));

		formats.forEach((tag) => {
			const rng = this.range();
			if ((textNodes.length > 0 && textNodes.every((node) => ancestors(node, null, this.element).some((element) => element.matches(tag)))) ||
				rng.collapsed && (is(rng.startContainer, tag) ||
				ancestors(rng.startContainer, null, this.element).some((element) => element.matches(tag)))) {
				this.styles.formats.push(tag);
			}
		});
	},

	updateContained() {
		this.contained.sections = this.contained({ sections: true }, true);

		this.contained.listItems = uniq(this.contained.sections.filter((node) => node.nodeName === 'LI'));

		this.contained.lists = this.contained(children(this._element, 'UL,OL'), true);

		this.contained.blocks = this.contained.sections.filter((node) => node.nodeName !== 'LI');

		const commonAncestor = this.range().commonAncestorContainer;

		this.contained.textNodes = commonAncestor.nodeType === 3 ? [ commonAncestor ] : this.contained({ element: commonAncestor, nodeType: 3 }, true);
	}
};
