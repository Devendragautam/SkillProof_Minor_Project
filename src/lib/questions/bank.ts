import type { TestCase } from "../types";

export interface BankQuestion {
  externalId: string;
  skill: string;
  category: "coding" | "debugging" | "mcq";
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  title: string;
  description: string;
  fnName?: string;
  starterCode?: string;
  testCases?: TestCase[];
  options?: string[];
  answerIndex?: number;
  explanation?: string;
  expectedComplexity?: string;
  timeLimitSec: number;
  points: number;
  /** SQL questions: presence marks the question as a SQL (SQLite) task */
  schemaSql?: string;
  seedSql?: string;
  solutionSql?: string;
}

// ─── Coding problems (executed in the JS sandbox) ───────────────────────────

const CODING: BankQuestion[] = [
  {
    externalId: "code-two-sum",
    skill: "DSA",
    category: "coding",
    topic: "Arrays & Hashing",
    difficulty: "easy",
    title: "Two Sum",
    description:
      "Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.\n\nEach input has exactly one solution, and you may not use the same element twice. Return the indices in ascending order.\n\nExample: twoSum([2,7,11,15], 9) → [0,1]",
    fnName: "twoSum",
    starterCode: "function twoSum(nums, target) {\n  // your code here\n}\n",
    testCases: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1], hidden: false },
      { args: [[3, 2, 4], 6], expected: [1, 2], hidden: false },
      { args: [[3, 3], 6], expected: [0, 1], hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "code-valid-parentheses",
    skill: "DSA",
    category: "coding",
    topic: "Stack",
    difficulty: "easy",
    title: "Valid Parentheses",
    description:
      "Given a string `s` containing only the characters '(', ')', '{', '}', '[' and ']', determine if the input is valid.\n\nA string is valid if brackets are closed by the same type in the correct order.\n\nExample: isValid('()[]{}') → true",
    fnName: "isValid",
    starterCode: "function isValid(s) {\n  // your code here\n}\n",
    testCases: [
      { args: ["()"], expected: true, hidden: false },
      { args: ["()[]{}"], expected: true, hidden: false },
      { args: ["([)]"], expected: false, hidden: true },
      { args: ["([])"], expected: true, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "code-climb-stairs",
    skill: "DSA",
    category: "coding",
    topic: "Dynamic Programming",
    difficulty: "easy",
    title: "Climbing Stairs",
    description:
      "You are climbing a staircase with `n` steps. Each time you can climb either 1 or 2 steps. In how many distinct ways can you reach the top?\n\nExample: climbStairs(3) → 3 (1+1+1, 1+2, 2+1)",
    fnName: "climbStairs",
    starterCode: "function climbStairs(n) {\n  // your code here\n}\n",
    testCases: [
      { args: [2], expected: 2, hidden: false },
      { args: [3], expected: 3, hidden: false },
      { args: [5], expected: 8, hidden: true },
      { args: [10], expected: 89, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "code-valid-anagram",
    skill: "DSA",
    category: "coding",
    topic: "Strings & Hashing",
    difficulty: "easy",
    title: "Valid Anagram",
    description:
      "Given two strings `s` and `t`, return true if `t` is an anagram of `s`, and false otherwise.\n\nExample: isAnagram('anagram', 'nagaram') → true",
    fnName: "isAnagram",
    starterCode: "function isAnagram(s, t) {\n  // your code here\n}\n",
    testCases: [
      { args: ["anagram", "nagaram"], expected: true, hidden: false },
      { args: ["rat", "car"], expected: false, hidden: false },
      { args: ["aacc", "ccac"], expected: false, hidden: true },
      { args: ["rat", "tar"], expected: true, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "code-max-subarray",
    skill: "DSA",
    category: "coding",
    topic: "Dynamic Programming / Greedy",
    difficulty: "medium",
    title: "Maximum Subarray",
    description:
      "Given an integer array `nums`, find the contiguous subarray with the largest sum and return that sum.\n\nExample: maxSubArray([-2,1,-3,4,-1,2,1,-5,4]) → 6 (subarray [4,-1,2,1])",
    fnName: "maxSubArray",
    starterCode: "function maxSubArray(nums) {\n  // your code here\n}\n",
    testCases: [
      { args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6, hidden: false },
      { args: [[1]], expected: 1, hidden: false },
      { args: [[5, 4, -1, 7, 8]], expected: 23, hidden: true },
      { args: [[-3, -1, -2]], expected: -1, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-longest-substring",
    skill: "DSA",
    category: "coding",
    topic: "Sliding Window",
    difficulty: "medium",
    title: "Longest Substring Without Repeating Characters",
    description:
      "Given a string `s`, find the length of the longest substring without repeating characters.\n\nExample: lengthOfLongestSubstring('abcabcbb') → 3 ('abc')",
    fnName: "lengthOfLongestSubstring",
    starterCode: "function lengthOfLongestSubstring(s) {\n  // your code here\n}\n",
    testCases: [
      { args: ["abcabcbb"], expected: 3, hidden: false },
      { args: ["bbbbb"], expected: 1, hidden: false },
      { args: ["pwwkew"], expected: 3, hidden: true },
      { args: [""], expected: 0, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-merge-intervals",
    skill: "DSA",
    category: "coding",
    topic: "Arrays & Sorting",
    difficulty: "medium",
    title: "Merge Intervals",
    description:
      "Given an array of `intervals` where intervals[i] = [start, end], merge all overlapping intervals and return the resulting array sorted by start.\n\nExample: merge([[1,3],[2,6],[8,10]]) → [[1,6],[8,10]]",
    fnName: "merge",
    starterCode: "function merge(intervals) {\n  // your code here\n}\n",
    testCases: [
      { args: [[[1, 3], [2, 6], [8, 10]]], expected: [[1, 6], [8, 10]], hidden: false },
      { args: [[[1, 4], [4, 5]]], expected: [[1, 5]], hidden: false },
      { args: [[[1, 4], [0, 4]]], expected: [[0, 4]], hidden: true },
      { args: [[[1, 4], [2, 3]]], expected: [[1, 4]], hidden: true },
    ],
    expectedComplexity: "O(n log n)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-product-except-self",
    skill: "DSA",
    category: "coding",
    topic: "Prefix / Suffix Arrays",
    difficulty: "medium",
    title: "Product of Array Except Self",
    description:
      "Given an integer array `nums`, return an array `answer` where answer[i] is the product of all elements except nums[i]. Do not use division.\n\nExample: productExceptSelf([1,2,3,4]) → [24,12,8,6]",
    fnName: "productExceptSelf",
    starterCode: "function productExceptSelf(nums) {\n  // your code here\n}\n",
    testCases: [
      { args: [[1, 2, 3, 4]], expected: [24, 12, 8, 6], hidden: false },
      { args: [[5, 1, 4, 2]], expected: [8, 40, 10, 20], hidden: false },
      { args: [[-1, 1, 0, -3, 3]], expected: [0, 0, 9, 0, 0], hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-search-range",
    skill: "DSA",
    category: "coding",
    topic: "Binary Search",
    difficulty: "medium",
    title: "Find First and Last Position",
    description:
      "Given an array of integers `nums` sorted in non-decreasing order and a `target`, find the starting and ending position of `target`. If target is not found, return [-1, -1]. Aim for O(log n).\n\nExample: searchRange([5,7,7,8,8,10], 8) → [3,4]",
    fnName: "searchRange",
    starterCode: "function searchRange(nums, target) {\n  // your code here\n}\n",
    testCases: [
      { args: [[5, 7, 7, 8, 8, 10], 8], expected: [3, 4], hidden: false },
      { args: [[5, 7, 7, 8, 8, 10], 6], expected: [-1, -1], hidden: false },
      { args: [[1], 1], expected: [0, 0], hidden: true },
      { args: [[], 0], expected: [-1, -1], hidden: true },
    ],
    expectedComplexity: "O(log n)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-group-anagrams",
    skill: "DSA",
    category: "coding",
    topic: "Hashing / Sorting",
    difficulty: "medium",
    title: "Group Anagrams",
    description:
      "Given an array of strings `strs`, group the anagrams together.\n\nOutput format: within each group, words must be sorted alphabetically; the list of groups must be sorted lexicographically by each group's first word.\n\nExample: groupAnagrams(['eat','tea','tan','ate','nat','bat']) → [['ate','eat','tea'],['bat'],['nat','tan']]",
    fnName: "groupAnagrams",
    starterCode: "function groupAnagrams(strs) {\n  // your code here\n}\n",
    testCases: [
      { args: [["eat", "tea", "tan", "ate", "nat", "bat"]], expected: [["ate", "eat", "tea"], ["bat"], ["nat", "tan"]], hidden: false },
      { args: [["a"]], expected: [["a"]], hidden: false },
      { args: [[""]], expected: [[""]], hidden: true },
      { args: [["stop", "pots", "tops", "hello"]], expected: [["hello"], ["pots", "stop", "tops"]], hidden: true },
    ],
    expectedComplexity: "O(n·k log k)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-top-k-frequent",
    skill: "DSA",
    category: "coding",
    topic: "Heap / Hashing",
    difficulty: "medium",
    title: "Top K Frequent Elements",
    description:
      "Given an integer array `nums` and integer `k`, return the `k` most frequent elements.\n\nOutput format: return them sorted in ascending numerical order. If two numbers tie on frequency, prefer the smaller number.\n\nExample: topKFrequent([1,1,1,2,2,3], 2) → [1,2]",
    fnName: "topKFrequent",
    starterCode: "function topKFrequent(nums, k) {\n  // your code here\n}\n",
    testCases: [
      { args: [[1, 1, 1, 2, 2, 3], 2], expected: [1, 2], hidden: false },
      { args: [[1], 1], expected: [1], hidden: false },
      { args: [[4, 4, 4, 6, 6, 7, 7, 7], 2], expected: [4, 7], hidden: true },
    ],
    expectedComplexity: "O(n log k)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-number-of-islands",
    skill: "DSA",
    category: "coding",
    topic: "Graphs / DFS",
    difficulty: "medium",
    title: "Number of Islands",
    description:
      "Given a 2D grid of '1's (land) and '0's (water), count the number of islands. An island is land connected horizontally or vertically. You may mutate the grid.\n\nExample: numIslands([['1','1','0'],['1','0','0'],['0','0','1']]) → 2",
    fnName: "numIslands",
    starterCode: "function numIslands(grid) {\n  // your code here\n}\n",
    testCases: [
      { args: [[["1", "1", "0"], ["1", "0", "0"], ["0", "0", "1"]]], expected: 2, hidden: false },
      { args: [[["1", "1", "1"], ["1", "1", "1"]]], expected: 1, hidden: false },
      { args: [[["0", "0"], ["0", "0"]]], expected: 0, hidden: true },
    ],
    expectedComplexity: "O(m·n)",
    timeLimitSec: 1200,
    points: 20,
  },
  {
    externalId: "code-coin-change",
    skill: "DSA",
    category: "coding",
    topic: "Dynamic Programming",
    difficulty: "hard",
    title: "Coin Change",
    description:
      "Given an array `coins` of distinct integers and an integer `amount`, return the fewest number of coins needed to make up that amount. If it cannot be made, return -1. You may use each coin unlimited times.\n\nExample: coinChange([1,2,5], 11) → 3 (5+5+1)",
    fnName: "coinChange",
    starterCode: "function coinChange(coins, amount) {\n  // your code here\n}\n",
    testCases: [
      { args: [[1, 2, 5], 11], expected: 3, hidden: false },
      { args: [[2], 3], expected: -1, hidden: false },
      { args: [[1], 0], expected: 0, hidden: true },
      { args: [[1, 5, 6, 9], 11], expected: 2, hidden: true },
    ],
    expectedComplexity: "O(amount·coins)",
    timeLimitSec: 1500,
    points: 25,
  },
  {
    externalId: "code-longest-palindrome",
    skill: "DSA",
    category: "coding",
    topic: "Strings",
    difficulty: "hard",
    title: "Longest Palindromic Substring",
    description:
      "Given a string `s`, return the longest palindromic substring. If several palindromes share the maximum length, return the leftmost one.\n\nExample: longestPalindrome('babad') → 'bab'",
    fnName: "longestPalindrome",
    starterCode: "function longestPalindrome(s) {\n  // your code here\n}\n",
    testCases: [
      { args: ["babad"], expected: "bab", hidden: false },
      { args: ["cbbd"], expected: "bb", hidden: false },
      { args: ["a"], expected: "a", hidden: true },
      { args: ["forgeeksskeegfor"], expected: "geeksskeeg", hidden: true },
    ],
    expectedComplexity: "O(n²)",
    timeLimitSec: 1500,
    points: 25,
  },
  {
    externalId: "code-trapping-rain-water",
    skill: "DSA",
    category: "coding",
    topic: "Two Pointers",
    difficulty: "hard",
    title: "Trapping Rain Water",
    description:
      "Given `n` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.\n\nExample: trap([0,1,0,2,1,0,1,3,2,1,2,1]) → 6",
    fnName: "trap",
    starterCode: "function trap(height) {\n  // your code here\n}\n",
    testCases: [
      { args: [[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]], expected: 6, hidden: false },
      { args: [[4, 2, 0, 3, 2, 5]], expected: 9, hidden: false },
      { args: [[3, 0, 3]], expected: 3, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 1500,
    points: 25,
  },
  {
    externalId: "code-kth-largest",
    skill: "DSA",
    category: "coding",
    topic: "Heap / Quickselect",
    difficulty: "medium",
    title: "Kth Largest Element",
    description:
      "Given an integer array `nums` and an integer `k`, return the k-th largest element in the array. Note that it is the k-th largest in sorted order, not the k-th distinct element.\n\nExample: findKthLargest([3,2,1,5,6,4], 2) → 5",
    fnName: "findKthLargest",
    starterCode: "function findKthLargest(nums, k) {\n  // your code here\n}\n",
    testCases: [
      { args: [[3, 2, 1, 5, 6, 4], 2], expected: 5, hidden: false },
      { args: [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], expected: 4, hidden: false },
      { args: [[1], 1], expected: 1, hidden: true },
      { args: [[7, 7, 7, 7], 2], expected: 7, hidden: true },
    ],
    expectedComplexity: "O(n log n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "code-lis",
    skill: "DSA",
    category: "coding",
    topic: "Dynamic Programming",
    difficulty: "medium",
    title: "Longest Increasing Subsequence",
    description:
      "Given an integer array `nums`, return the length of the longest strictly increasing subsequence.\n\nA subsequence is derived by deleting some or no elements without changing the order of the remaining elements.\n\nExample: lengthOfLIS([10,9,2,5,3,7,101,18]) → 4 (the LIS is [2,3,7,101])",
    fnName: "lengthOfLIS",
    starterCode: "function lengthOfLIS(nums) {\n  // your code here\n}\n",
    testCases: [
      { args: [[10, 9, 2, 5, 3, 7, 101, 18]], expected: 4, hidden: false },
      { args: [[0, 1, 0, 3, 2, 3]], expected: 4, hidden: false },
      { args: [[7, 7, 7, 7, 7]], expected: 1, hidden: true },
      { args: [[1, 3, 6, 7, 9, 4, 10, 5, 6]], expected: 6, hidden: true },
    ],
    expectedComplexity: "O(n²) or O(n log n)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-rotate-image",
    skill: "DSA",
    category: "coding",
    topic: "Matrix",
    difficulty: "medium",
    title: "Rotate Image",
    description:
      "Given an `n × n` 2D `matrix`, rotate the image by 90 degrees clockwise and return the matrix. Try to rotate it in place (or return a new matrix if you prefer — tests check the returned value).\n\nExample: rotate([[1,2,3],[4,5,6],[7,8,9]]) → [[7,4,1],[8,5,2],[9,6,3]]",
    fnName: "rotate",
    starterCode: "function rotate(matrix) {\n  // your code here\n}\n",
    testCases: [
      { args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], expected: [[7, 4, 1], [8, 5, 2], [9, 6, 3]], hidden: false },
      { args: [[[1, 2], [3, 4]]], expected: [[3, 1], [4, 2]], hidden: false },
      { args: [[[1]]], expected: [[1]], hidden: true },
      { args: [[[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]]], expected: [[15, 13, 2, 5], [14, 3, 4, 1], [12, 6, 8, 9], [16, 7, 10, 11]], hidden: true },
    ],
    expectedComplexity: "O(n²)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-min-path-sum",
    skill: "DSA",
    category: "coding",
    topic: "Dynamic Programming / Grid",
    difficulty: "medium",
    title: "Minimum Path Sum",
    description:
      "Given an `m × n` grid filled with non-negative numbers, find a path from the top-left corner to the bottom-right corner that minimizes the sum of numbers along its path. You may only move down or right at any point.\n\nExample: minPathSum([[1,3,1],[1,5,1],[4,2,1]]) → 7 (path 1→3→1→1→1)",
    fnName: "minPathSum",
    starterCode: "function minPathSum(grid) {\n  // your code here\n}\n",
    testCases: [
      { args: [[[1, 3, 1], [1, 5, 1], [4, 2, 1]]], expected: 7, hidden: false },
      { args: [[[1, 2, 3], [4, 5, 6]]], expected: 12, hidden: false },
      { args: [[[1, 2], [1, 1]]], expected: 3, hidden: true },
      { args: [[[0]]], expected: 0, hidden: true },
    ],
    expectedComplexity: "O(m·n)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-course-schedule",
    skill: "DSA",
    category: "coding",
    topic: "Graphs / Topological Sort",
    difficulty: "hard",
    title: "Course Schedule",
    description:
      "There are `numCourses` courses labeled 0 to numCourses-1 and a list `prerequisites` where each pair `[a, b]` means you must take course `b` before course `a`. Return true if you can finish all courses, i.e. the prerequisite graph has no cycle.\n\nExample: canFinish(2, [[1,0]]) → true; canFinish(2, [[1,0],[0,1]]) → false",
    fnName: "canFinish",
    starterCode: "function canFinish(numCourses, prerequisites) {\n  // your code here\n}\n",
    testCases: [
      { args: [2, [[1, 0]]], expected: true, hidden: false },
      { args: [2, [[1, 0], [0, 1]]], expected: false, hidden: false },
      { args: [4, [[1, 0], [2, 1], [3, 2]]], expected: true, hidden: true },
      { args: [5, [[1, 4], [2, 4], [3, 1], [3, 2]]], expected: true, hidden: true },
      { args: [3, [[0, 1], [1, 2], [2, 0]]], expected: false, hidden: true },
    ],
    expectedComplexity: "O(V + E)",
    timeLimitSec: 1500,
    points: 25,
  },
  {
    externalId: "code-min-window-substring",
    skill: "DSA",
    category: "coding",
    topic: "Sliding Window",
    difficulty: "hard",
    title: "Minimum Window Substring",
    description:
      "Given two strings `s` and `t`, return the minimum window substring of `s` such that every character in `t` (including duplicates) is included in the window. If there is no such substring, return the empty string \"\".\n\nExample: minWindow('ADOBECODEBANC', 'ABC') → 'BANC'",
    fnName: "minWindow",
    starterCode: "function minWindow(s, t) {\n  // your code here\n}\n",
    testCases: [
      { args: ["ADOBECODEBANC", "ABC"], expected: "BANC", hidden: false },
      { args: ["a", "a"], expected: "a", hidden: false },
      { args: ["a", "aa"], expected: "", hidden: true },
      { args: ["ab", "b"], expected: "b", hidden: true },
      { args: ["aaflslflsldkalskaaa", "aaa"], expected: "aaa", hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 1800,
    points: 25,
  },
  {
    externalId: "code-flatten-object",
    skill: "JavaScript",
    category: "coding",
    topic: "Objects & Recursion",
    difficulty: "medium",
    title: "Flatten Nested Object",
    description:
      "Given a (possibly deeply) nested object, return a flat object where nested keys become dot-separated paths.\n\nRules: primitive values (string, number, boolean, null) and arrays are kept as-is; empty nested objects are omitted from the result.\n\nExample: flatten({ a: { b: { c: 1 } }, d: 2 }) → { 'a.b.c': 1, d: 2 }",
    fnName: "flatten",
    starterCode: "function flatten(obj) {\n  // your code here\n}\n",
    testCases: [
      { args: [{ a: { b: { c: 1 } }, d: 2 }], expected: { "a.b.c": 1, d: 2 }, hidden: false },
      { args: [{ x: 1, y: { z: "s" } }], expected: { x: 1, "y.z": "s" }, hidden: false },
      { args: [{ arr: [1, { q: 2 }], e: {} }], expected: { arr: [1, { q: 2 }] }, hidden: true },
      { args: [{}], expected: {}, hidden: true },
      { args: [{ a: { b: {} } }], expected: {}, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 900,
    points: 10,
  },
  {
    externalId: "code-min-stack",
    skill: "DSA",
    category: "coding",
    topic: "Stack / Design",
    difficulty: "medium",
    title: "Min Stack",
    description:
      "Design a stack that supports push, pop, top, and retrieving the minimum element in constant time.\n\nImplement `minStackOps(ops)` which takes an array of operations, each one being `['push', val]`, `['pop']`, `['top']` or `['getMin']`, and returns an array with one output per operation:\n\n- `push` → null\n- `pop` → the popped value (null if empty)\n- `top` → the value on top without removing it (null if empty)\n- `getMin` → the smallest value currently in the stack (null if empty)\n\nExample: minStackOps([['push',-2],['push',0],['push',-3],['getMin'],['pop'],['top'],['getMin']]) → [null, null, null, -3, 0, -2, -2]",
    fnName: "minStackOps",
    starterCode: "function minStackOps(ops) {\n  // your code here\n}\n",
    testCases: [
      {
        args: [[
          ["push", -2], ["push", 0], ["push", -3], ["getMin"], ["pop"], ["top"], ["getMin"],
        ]],
        expected: [null, null, null, -3, -3, 0, -2],
        hidden: false,
      },
      { args: [[["push", 5], ["top"], ["getMin"]]], expected: [null, 5, 5], hidden: false },
      { args: [[["push", 2], ["push", 1], ["pop"], ["getMin"]]], expected: [null, null, 1, 2], hidden: true },
      { args: [[["pop"], ["top"], ["getMin"]]], expected: [null, null, null], hidden: true },
    ],
    expectedComplexity: "O(1) per op",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-insert-interval",
    skill: "DSA",
    category: "coding",
    topic: "Intervals",
    difficulty: "medium",
    title: "Insert Interval",
    description:
      "You are given an array of non-overlapping intervals `intervals` sorted by start time, and a new interval `newInterval`. Insert `newInterval` into `intervals`, merging any overlaps, and return the resulting sorted non-overlapping array.\n\nExample: insertInterval([[1,3],[6,9]], [2,5]) → [[1,5],[6,9]]",
    fnName: "insertInterval",
    starterCode: "function insertInterval(intervals, newInterval) {\n  // your code here\n}\n",
    testCases: [
      { args: [[[1, 3], [6, 9]], [2, 5]], expected: [[1, 5], [6, 9]], hidden: false },
      {
        args: [[[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]], [4, 8]],
        expected: [[1, 2], [3, 10], [12, 16]],
        hidden: false,
      },
      { args: [[[1, 5]], [2, 3]], expected: [[1, 5]], hidden: true },
      { args: [[], [5, 7]], expected: [[5, 7]], hidden: true },
      { args: [[[6, 8]], [1, 2]], expected: [[1, 2], [6, 8]], hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-town-judge",
    skill: "DSA",
    category: "coding",
    topic: "Graphs",
    difficulty: "easy",
    title: "Find the Town Judge",
    description:
      "In a town of `n` people, the judge is trusted by everyone else (n − 1 people) but trusts nobody. You are given `trust`, a list of pairs `[a, b]` meaning person `a` trusts person `b`.\n\nReturn the label of the town judge, or `-1` if no judge exists. People are labeled `1..n`.\n\nExample: findJudge(3, [[1,3],[2,3]]) → 3",
    fnName: "findJudge",
    starterCode: "function findJudge(n, trust) {\n  // your code here\n}\n",
    testCases: [
      { args: [2, [[1, 2]]], expected: 2, hidden: false },
      { args: [3, [[1, 3], [2, 3]]], expected: 3, hidden: false },
      { args: [3, [[1, 3], [2, 3], [3, 1]]], expected: -1, hidden: false },
      { args: [4, [[1, 4], [2, 4], [3, 4], [4, 3]]], expected: -1, hidden: true },
      { args: [1, []], expected: 1, hidden: true },
      { args: [3, [[1, 2], [2, 3], [3, 1], [1, 3]]], expected: -1, hidden: true },
    ],
    expectedComplexity: "O(T + n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "code-rotten-oranges",
    skill: "DSA",
    category: "coding",
    topic: "Graphs / BFS",
    difficulty: "medium",
    title: "Rotting Oranges",
    description:
      "Every minute, any fresh orange (1) that is 4-directionally adjacent to a rotten orange (2) becomes rotten. Cells with 0 are empty.\n\nGiven a `grid`, return the minimum number of minutes until no fresh oranges remain, or `-1` if impossible.\n\nExample: orangesRotting([[2,1,1],[1,1,0],[0,1,1]]) → 4",
    fnName: "orangesRotting",
    starterCode: "function orangesRotting(grid) {\n  // your code here\n}\n",
    testCases: [
      { args: [[[2, 1, 1], [1, 1, 0], [0, 1, 1]]], expected: 4, hidden: false },
      { args: [[[2, 1, 1], [0, 1, 1], [1, 0, 1]]], expected: -1, hidden: false },
      { args: [[[0, 2]]], expected: 0, hidden: false },
      { args: [[[1]]], expected: -1, hidden: true },
      { args: [[[2, 2], [2, 2]]], expected: 0, hidden: true },
      { args: [[[2, 1, 1], [1, 1, 1], [1, 1, 2]]], expected: 2, hidden: true },
    ],
    expectedComplexity: "O(R·C)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-word-break",
    skill: "DSA",
    category: "coding",
    topic: "Dynamic Programming",
    difficulty: "medium",
    title: "Word Break",
    description:
      "Given a string `s` and a dictionary of words `wordDict`, return `true` if `s` can be segmented into a space-separated sequence of one or more dictionary words. Words may be reused any number of times.\n\nExample: wordBreak('applepenapple', ['apple','pen']) → true",
    fnName: "wordBreak",
    starterCode: "function wordBreak(s, wordDict) {\n  // your code here\n}\n",
    testCases: [
      { args: ["leetcode", ["leet", "code"]], expected: true, hidden: false },
      { args: ["applepenapple", ["apple", "pen"]], expected: true, hidden: false },
      { args: ["catsandog", ["cats", "dog", "sand", "and", "cat"]], expected: false, hidden: false },
      { args: ["", ["a"]], expected: true, hidden: true },
      { args: ["cars", ["car", "ca", "rs"]], expected: true, hidden: true },
      { args: ["aaaaab", ["a", "aa", "aaa"]], expected: false, hidden: true },
    ],
    expectedComplexity: "O(n²·L)",
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "code-partition-subset",
    skill: "DSA",
    category: "coding",
    topic: "Dynamic Programming",
    difficulty: "medium",
    title: "Partition Equal Subset Sum",
    description:
      "Given an array of positive integers `nums`, return `true` if it can be partitioned into two subsets with equal sums, otherwise `false`. Every element must belong to exactly one subset.\n\nExample: canPartition([1,5,11,5]) → true ([1,5,5] and [11])",
    fnName: "canPartition",
    starterCode: "function canPartition(nums) {\n  // your code here\n}\n",
    testCases: [
      { args: [[1, 5, 11, 5]], expected: true, hidden: false },
      { args: [[1, 2, 3, 5]], expected: false, hidden: false },
      { args: [[2, 2, 3, 5]], expected: false, hidden: false },
      { args: [[3, 3, 3, 3]], expected: true, hidden: true },
      { args: [[1, 1]], expected: true, hidden: true },
      { args: [[]], expected: true, hidden: true },
      { args: [[100]], expected: false, hidden: true },
    ],
    expectedComplexity: "O(n·S)",
    timeLimitSec: 1200,
    points: 20,
  },
  {
    externalId: "code-network-delay",
    skill: "DSA",
    category: "coding",
    topic: "Graphs / Shortest Paths",
    difficulty: "hard",
    title: "Network Delay Time",
    description:
      "You are given a network of `n` nodes labeled `1..n` and a list `times` of signal travel times, where `times[i] = [u, v, w]` means a signal sent from node `u` reaches node `v` in `w` units.\n\nReturn how long it takes for all nodes to receive a signal sent from node `k`, or `-1` if some node is unreachable.\n\nExample: networkDelayTime([[2,1,1],[2,3,1],[3,4,1]], 4, 2) → 2",
    fnName: "networkDelayTime",
    starterCode: "function networkDelayTime(times, n, k) {\n  // your code here\n}\n",
    testCases: [
      { args: [[[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2], expected: 2, hidden: false },
      { args: [[[1, 2, 1]], 2, 1], expected: 1, hidden: false },
      { args: [[[1, 2, 1]], 2, 2], expected: -1, hidden: false },
      { args: [[[1, 2, 1], [2, 3, 7], [1, 3, 12]], 3, 1], expected: 8, hidden: true },
      { args: [[[1, 2, 2], [2, 3, 3], [3, 4, 1], [4, 5, 1]], 5, 1], expected: 7, hidden: true },
      { args: [[[1, 2, 2], [2, 3, 3], [3, 4, 1]], 5, 1], expected: -1, hidden: true },
    ],
    expectedComplexity: "O(n² + E) or O(E·log n)",
    timeLimitSec: 1800,
    points: 25,
  },
  // ── C++-skill coding pool (language-portable tests: C++/Java/Python/JS) ──
  {
    externalId: "cpp-code-rotate-array",
    skill: "C++",
    category: "coding",
    topic: "STL Algorithms",
    difficulty: "easy",
    title: "Rotate Array by K",
    description:
      "Given an array `nums` and an integer `k`, rotate the array to the **right** by `k` steps and return the result as a new array.\n\n`k` may be larger than the array length — reduce it modulo `n` first. An empty array stays empty.\n\nExample: rotateRight([1,2,3,4,5], 2) → [4,5,1,2,3]",
    fnName: "rotateRight",
    starterCode: "function rotateRight(nums, k) {\n  // your code here\n}\n",
    testCases: [
      { args: [[1, 2, 3, 4, 5], 2], expected: [4, 5, 1, 2, 3], hidden: false },
      { args: [[1, 2, 3], 4], expected: [3, 1, 2], hidden: false },
      { args: [[1], 0], expected: [1], hidden: false },
      { args: [[1, 2, 3, 4], 7], expected: [2, 3, 4, 1], hidden: true },
      { args: [[], 3], expected: [], hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 900,
    points: 10,
  },
  {
    externalId: "cpp-code-move-zeroes",
    skill: "C++",
    category: "coding",
    topic: "Two Pointers",
    difficulty: "easy",
    title: "Move Zeroes to End",
    description:
      "Given an array `nums`, move all `0`s to the end while keeping the relative order of the non-zero elements. Return the rearranged array.\n\nThe partition must be **stable** — non-zero elements keep their original order (this is exactly what `std::stable_partition` gives you).\n\nExample: moveZeroes([0,1,0,3,12]) → [1,3,12,0,0]",
    fnName: "moveZeroes",
    starterCode: "function moveZeroes(nums) {\n  // your code here\n}\n",
    testCases: [
      { args: [[0, 1, 0, 3, 12]], expected: [1, 3, 12, 0, 0], hidden: false },
      { args: [[0, 0, 1]], expected: [1, 0, 0], hidden: false },
      { args: [[4, 2]], expected: [4, 2], hidden: false },
      { args: [[0]], expected: [0], hidden: true },
      { args: [[0, 0, 0, 1, 0, 2]], expected: [1, 2, 0, 0, 0, 0], hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 900,
    points: 10,
  },
  {
    externalId: "cpp-code-kth-largest",
    skill: "C++",
    category: "coding",
    topic: "Selection & Heaps",
    difficulty: "medium",
    title: "Kth Largest Element",
    description:
      "Given an array `nums` (may contain duplicates) and an integer `k`, return the **k-th largest element** counting duplicates.\n\nA `std::priority_queue` (min-heap of size k) or `std::nth_element` both work — sorting is accepted too.\n\nExample: kthLargest([3,2,1,5,6,4], 2) → 5",
    fnName: "kthLargest",
    starterCode: "function kthLargest(nums, k) {\n  // your code here\n}\n",
    testCases: [
      { args: [[3, 2, 1, 5, 6, 4], 2], expected: 5, hidden: false },
      { args: [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], expected: 4, hidden: false },
      { args: [[7], 1], expected: 7, hidden: true },
      { args: [[2, 1], 2], expected: 1, hidden: true },
      { args: [[5, 5, 5, 5], 3], expected: 5, hidden: true },
    ],
    expectedComplexity: "O(n log k)",
    timeLimitSec: 1200,
    points: 15,
  },
  {
    externalId: "cpp-code-merge-sorted",
    skill: "C++",
    category: "coding",
    topic: "Two Pointers",
    difficulty: "medium",
    title: "Merge Two Sorted Arrays",
    description:
      "Given two sorted arrays `a` and `b`, merge them into a single sorted array and return it. Either array may be empty.\n\nThis is the merge step of merge sort — a two-pointer walk (like `std::merge`) beats concatenating and sorting.\n\nExample: mergeSorted([1,3,5], [2,4,6]) → [1,2,3,4,5,6]",
    fnName: "mergeSorted",
    starterCode: "function mergeSorted(a, b) {\n  // your code here\n}\n",
    testCases: [
      { args: [[1, 3, 5], [2, 4, 6]], expected: [1, 2, 3, 4, 5, 6], hidden: false },
      { args: [[], [1, 2]], expected: [1, 2], hidden: false },
      { args: [[1, 1, 2], [1, 3]], expected: [1, 1, 1, 2, 3], hidden: true },
      { args: [[-5, 0, 9], [-3, 2]], expected: [-5, -3, 0, 2, 9], hidden: true },
      { args: [[], []], expected: [], hidden: true },
    ],
    expectedComplexity: "O(n + m)",
    timeLimitSec: 1200,
    points: 15,
  },
];

// ─── Debugging problems (buggy starter, must be fixed) ──────────────────────

const DEBUGGING: BankQuestion[] = [
  {
    externalId: "dbg-binary-search",
    skill: "C++",
    category: "debugging",
    topic: "Debugging — Binary Search",
    difficulty: "easy",
    title: "Fix the Binary Search",
    description:
      "The iterative binary search below has exactly one bug and fails several test cases. Find it, fix it, and make all tests pass. Do not rewrite the algorithm — minimal fixes are preferred.",
    fnName: "search",
    starterCode:
      "function search(nums, target) {\n  let lo = 0;\n  let hi = nums.length - 1;\n  while (lo < hi) {                 // <- suspicious?\n    const mid = Math.floor((lo + hi) / 2);\n    if (nums[mid] === target) return mid;\n    else if (nums[mid] < target) lo = mid + 1;\n    else hi = mid - 1;\n  }\n  return -1;\n}\n",
    testCases: [
      { args: [[1, 3, 5, 7, 9], 5], expected: 2, hidden: false },
      { args: [[5], 5], expected: 0, hidden: false },
      { args: [[1, 3, 5, 7], 7], expected: 3, hidden: true },
      { args: [[2], 2], expected: 0, hidden: true },
      { args: [[1, 3, 5, 7, 9], 9], expected: 4, hidden: true },
    ],
    expectedComplexity: "O(log n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "dbg-palindrome-check",
    skill: "C++",
    category: "debugging",
    topic: "Debugging — Strings & Two Pointers",
    difficulty: "easy",
    title: "Fix the Palindrome Checker",
    description:
      "This function should return true when the cleaned string reads the same forwards and backwards. It currently returns wrong results for most inputs — there is exactly one bug. Fix it minimally.",
    fnName: "isPalindrome",
    starterCode:
      "function isPalindrome(s) {\n  s = s.toLowerCase().replace(/[^a-z0-9]/g, '');\n  let lo = 0;\n  let hi = s.length;          // <- suspicious?\n  while (lo < hi) {\n    if (s[lo] !== s[hi]) return false;\n    lo++;\n    hi--;\n  }\n  return true;\n}\n",
    testCases: [
      { args: ["A man, a plan, a canal: Panama"], expected: true, hidden: false },
      { args: ["race a car"], expected: false, hidden: false },
      { args: [""], expected: true, hidden: true },
      { args: ["0P"], expected: false, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "dbg-bubble-sort",
    skill: "Python",
    category: "debugging",
    topic: "Debugging — Sorting",
    difficulty: "easy",
    title: "Fix the Bubble Sort",
    description:
      "This bubble sort should return the array sorted in ascending order, but the output is reversed. There is exactly one bug. Fix it minimally.",
    fnName: "bubbleSort",
    starterCode:
      "function bubbleSort(arr) {\n  const a = [...arr];\n  for (let i = 0; i < a.length - 1; i++) {\n    for (let j = 0; j < a.length - 1 - i; j++) {\n      if (a[j] < a[j + 1]) {          // <- suspicious?\n        [a[j], a[j + 1]] = [a[j + 1], a[j]];\n      }\n    }\n  }\n  return a;\n}\n",
    testCases: [
      { args: [[5, 2, 9, 1]], expected: [1, 2, 5, 9], hidden: false },
      { args: [[3, 3, 1]], expected: [1, 3, 3], hidden: false },
      { args: [[2, 1]], expected: [1, 2], hidden: true },
      { args: [[]], expected: [], hidden: true },
    ],
    expectedComplexity: "O(n²)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "dbg-fibonacci",
    skill: "Python",
    category: "debugging",
    topic: "Debugging — Dynamic Programming",
    difficulty: "medium",
    title: "Fix the Fibonacci Sequence",
    description:
      "This iterative Fibonacci returns fib(n) where fib(0)=0, fib(1)=1 — but the results are shifted and wrong. There is exactly one bug in the base case / recurrence. Fix it minimally.",
    fnName: "fib",
    starterCode:
      "function fib(n) {\n  if (n === 0) return 1;          // <- suspicious?\n  let a = 1;\n  let b = 1;\n  for (let i = 2; i <= n; i++) {\n    const c = a + b;\n    a = b;\n    b = c;\n  }\n  return b;\n}\n",
    testCases: [
      { args: [0], expected: 0, hidden: false },
      { args: [5], expected: 5, hidden: false },
      { args: [1], expected: 1, hidden: true },
      { args: [10], expected: 55, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "dbg-valid-paren",
    skill: "DSA",
    category: "debugging",
    topic: "Debugging — Stack",
    difficulty: "medium",
    title: "Fix the Bracket Validator",
    description:
      "This bracket validator accepts some invalid strings as valid. It never checks the closing brackets properly. There is exactly one bug. Fix it minimally so all tests pass.",
    fnName: "isValid",
    starterCode:
      "function isValid(s) {\n  const stack = [];\n  const pairs = { ')': '(', ']': '[', '}': '{' };\n  for (const ch of s) {\n    if (ch === '(' || ch === '[' || ch === '{') {\n      stack.push(ch);\n    } else if (pairs[ch]) {\n      stack.pop();                  // <- suspicious?\n    }\n  }\n  return true;                      // <- suspicious?\n}\n",
    testCases: [
      { args: ["()[]{}"], expected: true, hidden: false },
      { args: ["([)]"], expected: false, hidden: false },
      { args: ["(("], expected: false, hidden: true },
      { args: [""], expected: true, hidden: true },
      { args: ["{[]}"], expected: true, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "dbg-anagram-count",
    skill: "Java",
    category: "debugging",
    topic: "Debugging — Hashing",
    difficulty: "medium",
    title: "Fix the Anagram Counter",
    description:
      "This function should verify that `t` is an anagram of `s` using a character frequency map. It wrongly accepts non-anagrams. There is exactly one bug. Fix it minimally.",
    fnName: "isAnagram",
    starterCode:
      "function isAnagram(s, t) {\n  if (s.length !== t.length) return false;\n  const count = {};\n  for (const ch of s) count[ch] = (count[ch] || 0) + 1;\n  for (const ch of t) {\n    if (!count[ch]) return false;\n    count[ch]++;                    // <- suspicious?\n  }\n  return true;\n}\n",
    testCases: [
      { args: ["aab", "abb"], expected: false, hidden: false },
      { args: ["anagram", "nagaram"], expected: true, hidden: false },
      { args: ["aacc", "ccac"], expected: false, hidden: true },
      { args: ["rat", "tar"], expected: true, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "dbg-missing-number",
    skill: "DSA",
    category: "debugging",
    topic: "Debugging — Math & Hashing",
    difficulty: "easy",
    title: "Fix the Missing Number Finder",
    description:
      "Given an array `nums` containing n distinct numbers taken from the range [0, n], this function should return the one number that is missing. It returns wrong values on most inputs. There is exactly one bug. Fix it minimally.",
    fnName: "missingNumber",
    starterCode:
      "function missingNumber(nums) {\n  const n = nums.length;\n  let sum = (n * (n + 1)) / 2;\n  for (let i = 0; i < n - 1; i++) {   // <- suspicious?\n    sum -= nums[i];\n  }\n  return sum;\n}\n",
    testCases: [
      { args: [[3, 0, 1]], expected: 2, hidden: false },
      { args: [[0, 1]], expected: 2, hidden: false },
      { args: [[9, 6, 4, 2, 3, 5, 7, 0, 1]], expected: 8, hidden: true },
      { args: [[0]], expected: 1, hidden: true },
      { args: [[1]], expected: 0, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "dbg-rotate-array",
    skill: "Java",
    category: "debugging",
    topic: "Debugging — Arrays",
    difficulty: "medium",
    title: "Fix the Array Rotation",
    description:
      "This function should rotate the array to the right by `k` steps and return the rotated array. It returns a truncated result. There is exactly one bug. Fix it minimally.",
    fnName: "rotate",
    starterCode:
      "function rotate(nums, k) {\n  const n = nums.length;\n  k = k % n;\n  const result = [];\n  for (let i = 0; i < n; i++) {\n    result[(i + k) % n] = nums[i];\n  }\n  return result.slice(k);           // <- suspicious?\n}\n",
    testCases: [
      { args: [[1, 2, 3, 4, 5], 2], expected: [4, 5, 1, 2, 3], hidden: false },
      { args: [[1, 2], 3], expected: [2, 1], hidden: false },
      { args: [[1], 0], expected: [1], hidden: true },
      { args: [[1, 2, 3], 4], expected: [3, 1, 2], hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "dbg-closure-counter",
    skill: "JavaScript",
    category: "debugging",
    topic: "Debugging — Closures",
    difficulty: "medium",
    title: "Fix the Closure Counters",
    description:
      "counterResults(n) should build n counter callbacks inside a loop and return their results when each is invoked — the expected output is [0, 1, ..., n-1]. It currently returns the wrong value for every counter. There is exactly one bug. Fix it minimally.",
    fnName: "counterResults",
    starterCode:
      "function counterResults(n) {\n  const fns = [];\n  for (var i = 0; i < n; i++) {\n    fns.push(function () {\n      return i;                // <- suspicious?\n    });\n  }\n  return fns.map(function (fn) {\n    return fn();\n  });\n}\n",
    testCases: [
      { args: [3], expected: [0, 1, 2], hidden: false },
      { args: [5], expected: [0, 1, 2, 3, 4], hidden: false },
      { args: [1], expected: [0], hidden: true },
      { args: [0], expected: [], hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "dbg-repeat-string",
    skill: "JavaScript",
    category: "debugging",
    topic: "Debugging — Loop Bounds",
    difficulty: "easy",
    title: "Fix the String Repeater",
    description:
      "repeatString(s, n) should return `s` concatenated exactly `n` times. It currently returns one repetition too many (or one too few on edge cases). There is exactly one bug. Fix it minimally.",
    fnName: "repeatString",
    starterCode:
      "function repeatString(s, n) {\n  let out = \"\";\n  for (let i = 0; i <= n; i++) {   // <- suspicious?\n    out += s;\n  }\n  return out;\n}\n",
    testCases: [
      { args: ["ab", 3], expected: "ababab", hidden: false },
      { args: ["x", 5], expected: "xxxxx", hidden: false },
      { args: ["hi", 0], expected: "", hidden: true },
      { args: ["=", 1], expected: "=", hidden: true },
    ],
    expectedComplexity: "O(n·|s|)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "dbg-sum-evens",
    skill: "JavaScript",
    category: "debugging",
    topic: "Debugging — Conditionals",
    difficulty: "easy",
    title: "Fix the Even-Summer",
    description:
      "sumEvens(nums) should return the sum of the even numbers in the array. It currently sums the wrong parity — the result is the odd numbers' sum instead. There is exactly one bug. Fix it minimally.",
    fnName: "sumEvens",
    starterCode:
      "function sumEvens(nums) {\n  let total = 0;\n  for (const n of nums) {\n    if (n % 2 === 1) {             // <- suspicious?\n      total += n;\n    }\n  }\n  return total;\n}\n",
    testCases: [
      { args: [[1, 2, 3, 4, 5, 6]], expected: 12, hidden: false },
      { args: [[2, 4, 8]], expected: 14, hidden: false },
      { args: [[1, 3, 5]], expected: 0, hidden: true },
      { args: [[-2, -3, 7, 10]], expected: 8, hidden: true },
    ],
    expectedComplexity: "O(n)",
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "dbg-numeric-sort",
    skill: "JavaScript",
    category: "debugging",
    topic: "Debugging — Sorting",
    difficulty: "medium",
    title: "Fix the Top-Three Picker",
    description:
      "topThree(nums) should return the three largest numbers in descending order (fewer if the array is shorter). It currently mis-orders numbers — the default sort compares them as strings, so 10 sorts before 9. There is exactly one bug. Fix it minimally.",
    fnName: "topThree",
    starterCode:
      "function topThree(nums) {\n  return [...nums].sort().reverse().slice(0, 3);   // <- suspicious?\n}\n",
    testCases: [
      { args: [[1, 10, 2, 40, 3]], expected: [40, 10, 3], hidden: false },
      { args: [[100, 20, 3, 4]], expected: [100, 20, 4], hidden: false },
      { args: [[5, 5, 5]], expected: [5, 5, 5], hidden: true },
      { args: [[9, 1]], expected: [9, 1], hidden: true },
    ],
    expectedComplexity: "O(n log n)",
    timeLimitSec: 600,
    points: 10,
  },
];

// ─── MCQ bank (conceptual — DBMS, OS, Networks, OOP, languages) ─────────────

const MCQ: BankQuestion[] = [
  {
    externalId: "dbms-3nf",
    skill: "DBMS", category: "mcq", topic: "Normalization", difficulty: "medium",
    title: "Normal Forms",
    description: "Which normal form is specifically designed to eliminate transitive dependencies, where a non-key attribute depends on another non-key attribute?",
    options: ["1NF", "2NF", "3NF", "BCNF"], answerIndex: 2,
    explanation: "3NF removes transitive dependencies; BCNF is a stricter variant of 3NF.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "dbms-left-join",
    skill: "DBMS", category: "mcq", topic: "Joins", difficulty: "easy",
    title: "Join Types",
    description: "Which JOIN returns every row from the left table and the matched rows from the right table, filling unmatched right-side columns with NULL?",
    options: ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "CROSS JOIN"], answerIndex: 1,
    explanation: "LEFT JOIN keeps all left rows; missing right matches become NULL.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "dbms-btree",
    skill: "DBMS", category: "mcq", topic: "Indexing", difficulty: "medium",
    title: "Index Structures",
    description: "For a workload mixing equality lookups and range queries (e.g. WHERE salary BETWEEN 50000 AND 80000) on an ordered column, which index type is most appropriate?",
    options: ["Hash index", "B-tree index", "Bitmap index", "No index helps range queries"], answerIndex: 1,
    explanation: "B-tree indexes keep keys sorted, supporting both point lookups and ranges. Hash indexes only support equality.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "dbms-atomicity",
    skill: "DBMS", category: "mcq", topic: "Transactions", difficulty: "medium",
    title: "ACID Properties",
    description: "A transaction updates 3 tables, then the DBMS crashes before COMMIT and only some updates are persisted. Which ACID property was violated?",
    options: ["Atomicity", "Consistency", "Isolation", "Durability"], answerIndex: 0,
    explanation: "Atomicity guarantees all-or-nothing execution of a transaction.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "dbms-second-max",
    skill: "DBMS", category: "mcq", topic: "SQL", difficulty: "medium",
    title: "SQL — Second Highest Salary",
    description: "Which query correctly returns the second-highest DISTINCT salary from Employee?",
    options: [
      "SELECT MAX(salary) FROM Employee WHERE salary = MAX(salary)",
      "SELECT MAX(salary) FROM Employee WHERE salary < (SELECT MAX(salary) FROM Employee)",
      "SELECT salary FROM Employee LIMIT 1 OFFSET 2",
      "SELECT TOP 2 salary FROM Employee",
    ],
    answerIndex: 1,
    explanation: "A comparison against the maximum below the top salary yields the second-highest distinct salary.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "dbms-isolation",
    skill: "DBMS", category: "mcq", topic: "Transactions", difficulty: "easy",
    title: "ACID — Isolation",
    description: "In the ACID guarantees, what does the 'I' stand for?",
    options: ["Integrity", "Indexing", "Isolation", "Interleaving"], answerIndex: 2,
    explanation: "Isolation ensures concurrent transactions do not interfere with each other.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "dbms-truncate",
    skill: "DBMS", category: "mcq", topic: "SQL", difficulty: "easy",
    title: "DELETE vs TRUNCATE",
    description: "Which statement removes ALL rows from a table quickly while keeping the table structure for future use?",
    options: ["DELETE", "TRUNCATE", "DROP", "ALTER"], answerIndex: 1,
    explanation: "TRUNCATE deallocates data pages without dropping the table definition.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "dbms-primary-key",
    skill: "DBMS", category: "mcq", topic: "Keys & Constraints", difficulty: "easy",
    title: "Primary Keys",
    description: "Which statement about a PRIMARY KEY is TRUE?",
    options: [
      "It may contain NULL values",
      "It uniquely identifies each row and cannot be NULL",
      "A table can have several primary keys",
      "It must be an auto-incrementing integer",
    ],
    answerIndex: 1,
    explanation: "A primary key enforces uniqueness and NOT NULL; a table has at most one.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "os-sjf-starvation",
    skill: "Operating Systems", category: "mcq", topic: "CPU Scheduling", difficulty: "medium",
    title: "Scheduling & Starvation",
    description: "Which CPU scheduling algorithm can indefinitely postpone (starve) long jobs?",
    options: ["FCFS", "Round Robin", "Shortest Job First", "Multilevel queue with aging"], answerIndex: 2,
    explanation: "SJF always picks the shortest ready job, so long jobs may never run without aging.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "os-deadlock-conditions",
    skill: "Operating Systems", category: "mcq", topic: "Deadlocks", difficulty: "medium",
    title: "Deadlock Conditions",
    description: "A deadlock requires ALL of the following conditions to hold simultaneously EXCEPT:",
    options: ["Mutual exclusion", "Hold and wait", "Preemption", "Circular wait"], answerIndex: 2,
    explanation: "Deadlock requires NO preemption — resources cannot be forcibly taken away.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "os-thrashing",
    skill: "Operating Systems", category: "mcq", topic: "Virtual Memory", difficulty: "medium",
    title: "Thrashing",
    description: "Thrashing in an operating system is best described as:",
    options: [
      "Executing too many CPU-bound processes",
      "Excessive paging activity — the system spends more time swapping than executing",
      "A deadlock between two processes",
      "Corrupted page tables",
    ],
    answerIndex: 1,
    explanation: "Thrashing happens when the working set exceeds physical memory and pages are constantly swapped.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "os-zombie",
    skill: "Operating Systems", category: "mcq", topic: "Processes", difficulty: "medium",
    title: "Zombie Processes",
    description: "What is a zombie process?",
    options: [
      "A process stuck in an infinite loop",
      "A terminated process whose exit status has not yet been read by its parent",
      "A process with the highest scheduling priority",
      "A process whose memory has been swapped to disk",
    ],
    answerIndex: 1,
    explanation: "The process table entry remains until the parent calls wait() to read the exit status.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "cn-udp",
    skill: "Computer Networks", category: "mcq", topic: "Transport Layer", difficulty: "easy",
    title: "UDP vs TCP",
    description: "Which transport protocol is connectionless and does not guarantee delivery or ordering?",
    options: ["TCP", "UDP", "HTTP", "FTP"], answerIndex: 1,
    explanation: "UDP is a fire-and-forget datagram protocol without handshakes.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "cn-handshake",
    skill: "Computer Networks", category: "mcq", topic: "TCP", difficulty: "easy",
    title: "Three-Way Handshake",
    description: "What is the correct order of TCP's three-way handshake?",
    options: ["ACK → SYN → SYN-ACK", "SYN → ACK → SYN-ACK", "SYN → SYN-ACK → ACK", "SYN-ACK → SYN → ACK"], answerIndex: 2,
    explanation: "Client SYN, server SYN-ACK, client ACK — connection established.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "cn-router-layer",
    skill: "Computer Networks", category: "mcq", topic: "OSI Model", difficulty: "easy",
    title: "OSI Layers",
    description: "At which OSI layer does a router primarily operate?",
    options: ["Data Link (L2)", "Network (L3)", "Transport (L4)", "Session (L5)"], answerIndex: 1,
    explanation: "Routers forward packets based on IP addresses at Layer 3.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "cn-dns-port",
    skill: "Computer Networks", category: "mcq", topic: "Application Layer", difficulty: "medium",
    title: "DNS Protocol",
    description: "DNS name-resolution queries most commonly use which transport protocol and port?",
    options: ["TCP port 80", "UDP port 53", "TCP port 25", "UDP port 67"], answerIndex: 1,
    explanation: "Standard DNS queries travel over UDP/53; TCP is used for large responses and zone transfers.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "oop-polymorphism",
    skill: "OOP", category: "mcq", topic: "Core Concepts", difficulty: "easy",
    title: "Polymorphism",
    description: "Which OOP principle allows different classes to be used through a common interface while each provides its own implementation?",
    options: ["Encapsulation", "Inheritance", "Polymorphism", "Instantiation"], answerIndex: 2,
    explanation: "Polymorphism lets a single call dispatch to type-specific implementations.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "oop-liskov",
    skill: "OOP", category: "mcq", topic: "Design Principles", difficulty: "medium",
    title: "SOLID — L",
    description: "In the SOLID design principles, what does the 'L' stand for?",
    options: ["Loose coupling", "Liskov Substitution Principle", "Late binding", "Layered architecture"], answerIndex: 1,
    explanation: "Subtypes must be substitutable for their base types without breaking behavior.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "oop-encapsulation",
    skill: "OOP", category: "mcq", topic: "Core Concepts", difficulty: "easy",
    title: "Encapsulation",
    description: "Encapsulation is best described as:",
    options: [
      "Bundling data with the methods that operate on it and restricting direct external access",
      "Creating many copies of an object",
      "Inheriting behavior from multiple classes",
      "Compiling code into bytecode",
    ],
    answerIndex: 0,
    explanation: "Encapsulation hides internal state behind a controlled interface.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "cpp-division",
    skill: "C++", category: "mcq", topic: "Output Prediction", difficulty: "easy",
    title: "Integer vs Float Division",
    description: "What is the output of:  cout << (5 / 2) << \" \" << (5.0 / 2);",
    options: ["2 2.5", "2.5 2.5", "2 2", "3 2.5"], answerIndex: 0,
    explanation: "5/2 is integer division → 2; 5.0/2 promotes to floating point → 2.5.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "cpp-new-heap",
    skill: "C++", category: "mcq", topic: "Memory Management", difficulty: "easy",
    title: "new Operator",
    description: "The `new` operator in C++ allocates memory from:",
    options: ["The stack", "The heap (free store)", "CPU registers", "Static memory"], answerIndex: 1,
    explanation: "new allocates dynamic storage on the heap; you must delete it later.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "cpp-dangling",
    skill: "C++", category: "mcq", topic: "Memory Management", difficulty: "medium",
    title: "Dangling Pointers",
    description: "What is a dangling pointer?",
    options: [
      "A pointer set to nullptr",
      "A pointer to memory that has been freed or has gone out of scope",
      "Two pointers referencing each other",
      "A pointer declared but never used",
    ],
    answerIndex: 1,
    explanation: "Accessing freed memory through a dangling pointer is undefined behavior.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "cpp-unordered-map",
    skill: "C++", category: "mcq", topic: "STL", difficulty: "easy",
    title: "STL Containers",
    description: "Which C++ STL container provides average O(1) key-based lookup?",
    options: ["std::map", "std::unordered_map", "std::vector", "std::set"], answerIndex: 1,
    explanation: "unordered_map is hash-based; std::map is a red-black tree with O(log n) lookups.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "py-set-len",
    skill: "Python", category: "mcq", topic: "Data Structures", difficulty: "easy",
    title: "Python Sets",
    description: "What does len({1, 1, 2, 3}) return in Python?",
    options: ["4", "3", "2", "It raises a RuntimeError"], answerIndex: 1,
    explanation: "Sets deduplicate: {1,1,2,3} → {1,2,3}, so len is 3.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "py-mutable",
    skill: "Python", category: "mcq", topic: "Type System", difficulty: "easy",
    title: "Mutability",
    description: "Which of the following Python built-in types is mutable?",
    options: ["tuple", "str", "list", "frozenset"], answerIndex: 2,
    explanation: "Lists can be modified in place; tuples, strings and frozensets are immutable.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "py-power-assoc",
    skill: "Python", category: "mcq", topic: "Output Prediction", difficulty: "medium",
    title: "Operator Precedence",
    description: "What does print(2 ** 3 ** 2) output?",
    options: ["64", "512", "12", "36"], answerIndex: 1,
    explanation: "** is right-associative: 3**2 = 9, then 2**9 = 512.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "react-usememo",
    skill: "React", category: "mcq", topic: "Hooks", difficulty: "easy",
    title: "Memoization Hook",
    description: "Which React hook caches the result of an expensive computation between renders?",
    options: ["useEffect", "useMemo", "useRef", "useState"], answerIndex: 1,
    explanation: "useMemo recomputes only when its dependency array changes.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "react-keys",
    skill: "React", category: "mcq", topic: "Rendering Lists", difficulty: "easy",
    title: "List Keys",
    description: "In React lists, the `key` prop is primarily used to:",
    options: [
      "Style list items",
      "Help React identify which items changed, were added, or were removed across renders",
      "Encrypt list data",
      "Sort the list automatically",
    ],
    answerIndex: 1,
    explanation: "Stable keys let the reconciler match elements between renders.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "js-const-let",
    skill: "JavaScript", category: "mcq", topic: "Language Fundamentals", difficulty: "easy",
    title: "const vs let",
    description: "In JavaScript, how does `const` differ from `let`?",
    options: [
      "const bindings cannot be reassigned after initialization",
      "const objects become deeply immutable",
      "const variables are block-scoped, let are function-scoped",
      "There is no practical difference",
    ], answerIndex: 0,
    explanation: "const prevents reassignment of the binding; object contents can still be mutated.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "node-event-loop",
    skill: "Node.js", category: "mcq", topic: "Runtime", difficulty: "medium",
    title: "Node.js Event Loop",
    description: "Which statement about the Node.js event loop is TRUE?",
    options: [
      "Each incoming request gets its own OS thread",
      "Node runs JavaScript on a single main thread and multiplexes I/O through the event loop",
      "The event loop spawns a new V8 instance per callback",
      "Node cannot perform async I/O",
    ], answerIndex: 1,
    explanation: "Node is single-threaded for JS execution; libuv handles async I/O and a thread pool for heavy work.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "git-rebase",
    skill: "Git", category: "mcq", topic: "History Management", difficulty: "easy",
    title: "Rebase",
    description: "Which Git command reapplies commits on top of another base tip, producing a linear history?",
    options: ["git merge", "git rebase", "git cherry-pick", "git stash"], answerIndex: 1,
    explanation: "rebase moves (replays) commits onto a new base commit.",
    timeLimitSec: 60, points: 5,
  },
  {
    externalId: "algo-bfs-queue",
    skill: "DSA", category: "mcq", topic: "Graph Traversal", difficulty: "easy",
    title: "BFS Auxiliary Structure",
    description: "Breadth-First Search (BFS) explores a graph level by level. Which auxiliary data structure does it rely on?",
    options: ["Stack", "Queue", "Min-heap", "Disjoint set"], answerIndex: 1,
    explanation: "BFS uses a FIFO queue so nodes are processed in discovery order, ensuring level-by-level traversal.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "algo-dp-memo",
    skill: "DSA", category: "mcq", topic: "Dynamic Programming", difficulty: "medium",
    title: "Memoization",
    description: "Top-down dynamic programming with memoization primarily avoids recomputing what?",
    options: ["Leaf nodes only", "Overlapping subproblems", "Adjacent vertices", "Negative-weight edges"], answerIndex: 1,
    explanation: "Memoization caches results of overlapping subproblems so each is computed exactly once.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "algo-quickselect",
    skill: "DSA", category: "mcq", topic: "Selection Algorithms", difficulty: "medium",
    title: "QuickSelect Complexity",
    description: "What is the average-case time complexity of QuickSelect when finding the k-th largest element?",
    options: ["O(n log n)", "O(n)", "O(n²)", "O(log n)"], answerIndex: 1,
    explanation: "QuickSelect partitions like quicksort but recurses into one side only, giving O(n) average time (O(n²) worst case).",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "algo-topological",
    skill: "DSA", category: "mcq", topic: "Graphs / Dependencies", difficulty: "medium",
    title: "Task Dependency Order",
    description: "You must schedule tasks where each task depends on several prerequisite tasks. Which algorithm determines a valid order (or detects that none exists)?",
    options: ["Dijkstra's algorithm", "Topological sort (Kahn's algorithm)", "Bellman-Ford", "Floyd's cycle detection"], answerIndex: 1,
    explanation: "Kahn's topological sort orders DAG vertices by in-degree; a leftover in-degree > 0 means a cycle, so no valid order exists.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "algo-dijkstra-negative",
    skill: "DSA", category: "mcq", topic: "Graphs / Shortest Paths", difficulty: "medium",
    title: "Dijkstra's Blind Spot",
    description: "Dijkstra's algorithm greedily finalizes the closest unvisited node. On which kind of graph can it return a wrong shortest-path result?",
    options: ["Disconnected graphs", "Graphs with negative-weight edges", "Directed acyclic graphs", "Graphs with parallel edges"], answerIndex: 1,
    explanation: "A negative edge can shorten a path after a node was already finalized, so Dijkstra's greedy invariant breaks — Bellman-Ford handles negative weights.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "algo-bipartite-coloring",
    skill: "DSA", category: "mcq", topic: "Graph Properties", difficulty: "easy",
    title: "Bipartite Test",
    description: "A graph is bipartite exactly when its vertices can be split into two independent sets. What is the simplest coloring check for this?",
    options: ["Color with 2 colors so no edge joins equal colors", "Color with 3 colors greedily", "Give every vertex a unique color", "Color by vertex degree parity"], answerIndex: 0,
    explanation: "Bipartite ⇔ 2-colorable ⇔ no odd cycle. A BFS/DFS two-coloring (alternate colors per level) detects violations in one pass.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "js-event-loop-order",
    skill: "JavaScript", category: "mcq", topic: "Event Loop & Async", difficulty: "medium",
    title: "Async Output Order",
    description: "What does this snippet print?\n\nconsole.log('a');\nsetTimeout(() => console.log('b'), 0);\nPromise.resolve().then(() => console.log('c'));\nconsole.log('d');",
    options: ["a d b c", "a d c b", "a b c d", "a c d b"], answerIndex: 1,
    explanation: "Synchronous code runs first (a, d). Promise callbacks are microtasks and run before the macrotask setTimeout (c, then b).",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "js-prototype-create",
    skill: "JavaScript", category: "mcq", topic: "Prototypes", difficulty: "medium",
    title: "Object.create",
    description: "Which statement about `Object.create(proto)` is TRUE?",
    options: [
      "It copies all of proto's own enumerable properties onto the new object",
      "It creates a new object whose [[Prototype]] is proto, so missing property lookups delegate up the chain",
      "It creates an object with no prototype, regardless of the argument",
      "It only accepts constructor functions, not plain objects",
    ], answerIndex: 1,
    explanation: "Object.create sets up prototype-linkage (delegation), not copying. The new object starts with no own properties; reads fall through to proto.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "react-stale-closure",
    skill: "React", category: "mcq", topic: "Hooks", difficulty: "medium",
    title: "Stale Closure in useEffect",
    description: "A component runs:\n\nuseEffect(() => {\n  const id = setInterval(() => setCount(count + 1), 1000);\n  return () => clearInterval(id);\n}, []);\n\nwith count starting at 0. What happens?",
    options: [
      "Count increments by 1 every second, indefinitely",
      "Count only reaches 1 — the interval callback permanently closes over the initial count (0)",
      "The interval never fires because effects cannot capture state",
      "React throws an error when setCount is called inside setInterval",
    ], answerIndex: 1,
    explanation: "The empty dependency array captures the first render's count. Each tick sets count to 0 + 1. Fix with a functional update (setCount(c => c + 1)) or include count in the deps.",
    timeLimitSec: 90, points: 5,
  },
  {
    externalId: "node-streams-backpressure",
    skill: "Node.js", category: "mcq", topic: "Streams & Backpressure", difficulty: "medium",
    title: "Handling Backpressure",
    description: "A readable stream produces data faster than the writable destination consumes it. What is the recommended way to keep memory under control?",
    options: [
      "Accumulate every chunk in an array and write everything at the end",
      "Respect write() returning false: pause the source until the 'drain' event (or use pipe / stream.pipeline, which handle this automatically)",
      "Raise the stream's highWaterMark until the error disappears",
      "Wrap writes in process.nextTick so they flush sooner",
    ], answerIndex: 1,
    explanation: "Backpressure is handled by pausing the readable side when the writable buffer is full (write() === false) and resuming on 'drain'. pipe/pipeline implement this for you.",
    timeLimitSec: 90, points: 5,
  },
];

// ─── SQL problems (executed against in-memory SQLite) ───────────────────

const SQL: BankQuestion[] = [
  {
    externalId: "sql-second-highest-salary",
    skill: "DBMS",
    category: "coding",
    topic: "SQL Queries",
    difficulty: "easy",
    title: "Second Highest Distinct Salary",
    description:
      "The `employees` table holds one row per employee.\n\nWrite a single SELECT query that returns the **second highest distinct salary** in the table, as a single column named `second_highest`.\n\n- Duplicate salaries count once.\n- If there is no second highest distinct salary (fewer than two distinct values), the query must return **no rows at all** (not NULL).\n\nThe result must contain exactly one column, in the exact order shown.",
    schemaSql: `CREATE TABLE employees (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  salary  REAL NOT NULL
);`,
    seedSql: `INSERT INTO employees (name, salary) VALUES
  ('Ann Muller', 9200),
  ('Ben Ortiz', 8500),
  ('Cara Silva', 8500),
  ('Deep Patel', 7300),
  ('Ella Novak', 7300),
  ('Frank Wu', 6100);`,
    solutionSql: `SELECT second_highest
FROM (
  SELECT salary AS second_highest,
         DENSE_RANK() OVER (ORDER BY salary DESC) AS rnk
  FROM employees
  GROUP BY salary
)
WHERE rnk = 2;`,
    testCases: [
      { args: [], hidden: false, expected: [[8500]] },
      { args: [], hidden: false, setup: "DELETE FROM employees WHERE salary = 8500;", expected: [[7300]] },
      { args: [], hidden: true, setup: "DELETE FROM employees WHERE salary > 6100;", expected: [] },
    ],
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "sql-department-top-earner",
    skill: "DBMS",
    category: "coding",
    topic: "SQL Joins",
    difficulty: "medium",
    title: "Top Earner per Department",
    description:
      "Two tables: `departments` and `employees` (every employee belongs to exactly one department via `dept_id`).\n\nWrite a single SELECT query that returns, for **every department**, its name and the highest salary paid in it — ordered by department name ascending.\n\n- Columns (in this exact order): `department`, `top_salary`.\n- Departments with no employees must still appear, with `top_salary` NULL.\n- Employees are never deleted; salaries may repeat within a department.",
    schemaSql: `CREATE TABLE departments (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE employees (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  dept_id INTEGER NOT NULL REFERENCES departments(id),
  salary  REAL NOT NULL
);`,
    seedSql: `INSERT INTO departments (name) VALUES ('Engineering'), ('Finance'), ('Marketing');
INSERT INTO employees (name, dept_id, salary) VALUES
  ('Ann Muller', 1, 9200),
  ('Ben Ortiz', 1, 8500),
  ('Cara Silva', 1, 9200),
  ('Deep Patel', 2, 7300),
  ('Ella Novak', 2, 7100);`,
    solutionSql: `SELECT d.name AS department, MAX(e.salary) AS top_salary
FROM departments d
LEFT JOIN employees e ON e.dept_id = d.id
GROUP BY d.id, d.name
ORDER BY d.name ASC;`,
    testCases: [
      { args: [], hidden: false, expected: [["Engineering", 9200], ["Finance", 7300], ["Marketing", null]] },
      {
        args: [],
        hidden: false,
        setup: "INSERT INTO employees (name, dept_id, salary) VALUES ('Frank Wu', 3, 8800);",
        expected: [["Engineering", 9200], ["Finance", 7300], ["Marketing", 8800]],
      },
      { args: [], hidden: true, setup: "UPDATE employees SET salary = 9999 WHERE dept_id = 2;", expected: [["Engineering", 9200], ["Finance", 9999], ["Marketing", null]] },
    ],
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "sql-monthly-order-volume",
    skill: "DBMS",
    category: "coding",
    topic: "SQL Aggregation",
    difficulty: "medium",
    title: "Monthly Revenue Report",
    description:
      "The `orders` table records one row per order with its total `amount` and the ISO date it was placed.\n\nWrite a single SELECT query that aggregates revenue **per month**, chronologically.\n\n- Columns (in this exact order): `month` (formatted `YYYY-MM` as TEXT), `orders` (number of orders that month), `revenue` (sum of amounts, rounded to 2 decimal places).\n- Only include months that have at least one order.\n- Sort by month ascending.",
    schemaSql: `CREATE TABLE orders (
  id         INTEGER PRIMARY KEY,
  customer   TEXT NOT NULL,
  amount     REAL NOT NULL,
  placed_on  TEXT NOT NULL -- ISO date, e.g. 2026-01-05
);`,
    seedSql: `INSERT INTO orders (customer, amount, placed_on) VALUES
  ('Acme',   120.5,  '2025-11-03'),
  ('Bolt',   80.0,   '2025-11-19'),
  ('Acme',   240.75, '2025-12-02'),
  ('Cinder', 55.25,  '2025-12-14'),
  ('Bolt',   130.0,  '2025-12-21'),
  ('Acme',   300.0,  '2026-01-08'),
  ('Cinder', 42.5,   '2026-01-27');`,
    solutionSql: `SELECT strftime('%Y-%m', placed_on) AS month,
       COUNT(*) AS orders,
       ROUND(SUM(amount), 2) AS revenue
FROM orders
GROUP BY month
ORDER BY month ASC;`,
    testCases: [
      {
        args: [],
        hidden: false,
        expected: [
          ["2025-11", 2, 200.5],
          ["2025-12", 3, 426.0],
          ["2026-01", 2, 342.5],
        ],
      },
      {
        args: [],
        hidden: false,
        setup: "DELETE FROM orders WHERE customer = 'Acme';",
        expected: [
          ["2025-11", 1, 80.0],
          ["2025-12", 2, 185.25],
          ["2026-01", 1, 42.5],
        ],
      },
      {
        args: [],
        hidden: true,
        setup: "INSERT INTO orders (customer, amount, placed_on) VALUES ('Drift', 99.99, '2026-02-01');",
        expected: [
          ["2025-11", 2, 200.5],
          ["2025-12", 3, 426.0],
          ["2026-01", 2, 342.5],
          ["2026-02", 1, 99.99],
        ],
      },
    ],
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "sql-avg-salary-by-department",
    skill: "DBMS",
    category: "coding",
    topic: "SQL Aggregation",
    difficulty: "easy",
    title: "Average Salary per Department",
    description:
      "Two tables: `departments` and `employees` (every employee belongs to exactly one department via `dept_id`).\n\nWrite a single SELECT query that returns each department's name and its **average salary rounded to 1 decimal place** — only departments that have at least one employee, highest average first (ties broken by department name ascending).\n\n- Columns (in this exact order): `department`, `avg_salary`.",
    schemaSql: `CREATE TABLE departments (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE employees (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  dept_id INTEGER NOT NULL REFERENCES departments(id),
  salary  REAL NOT NULL
);`,
    seedSql: `INSERT INTO departments (name) VALUES ('Engineering'), ('Sales'), ('HR');
INSERT INTO employees (name, dept_id, salary) VALUES
  ('Asha', 1, 9000), ('Bilal', 1, 8000), ('Chen', 1, 7000),
  ('Divya', 2, 5000), ('Emre', 2, 6000),
  ('Farah', 3, 4500);`,
    solutionSql: `SELECT d.name AS department, ROUND(AVG(e.salary), 1) AS avg_salary
FROM departments d
JOIN employees e ON e.dept_id = d.id
GROUP BY d.id, d.name
ORDER BY avg_salary DESC, d.name ASC;`,
    testCases: [
      {
        args: [],
        hidden: false,
        expected: [
          ["Engineering", 8000],
          ["Sales", 5500],
          ["HR", 4500],
        ],
      },
      {
        args: [],
        hidden: false,
        setup: "UPDATE employees SET salary = salary + 1000 WHERE dept_id = 3;",
        expected: [
          ["Engineering", 8000],
          ["HR", 5500],
          ["Sales", 5500],
        ],
      },
      {
        args: [],
        hidden: true,
        setup: "DELETE FROM employees WHERE dept_id = 1;",
        expected: [
          ["Sales", 5500],
          ["HR", 4500],
        ],
      },
    ],
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "sql-above-dept-average",
    skill: "DBMS",
    category: "coding",
    topic: "SQL Subqueries",
    difficulty: "medium",
    title: "Above Department Average",
    description:
      "Two tables: `departments` and `employees` (every employee belongs to exactly one department via `dept_id`).\n\nWrite a single SELECT query listing every employee whose salary is **strictly above the average salary of their own department** — compared per department, not company-wide.\n\n- Columns (in this exact order): `employee`, `department`, `salary`.\n- Order by salary descending, ties broken by employee name ascending.",
    schemaSql: `CREATE TABLE departments (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE employees (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  dept_id INTEGER NOT NULL REFERENCES departments(id),
  salary  REAL NOT NULL
);`,
    seedSql: `INSERT INTO departments (name) VALUES ('Engineering'), ('Sales'), ('HR');
INSERT INTO employees (name, dept_id, salary) VALUES
  ('Asha', 1, 9000), ('Bilal', 1, 8000), ('Chen', 1, 7000),
  ('Divya', 2, 5000), ('Emre', 2, 6000),
  ('Farah', 3, 4500);`,
    solutionSql: `SELECT e.name AS employee, d.name AS department, e.salary
FROM employees e
JOIN departments d ON d.id = e.dept_id
WHERE e.salary > (
  SELECT AVG(e2.salary) FROM employees e2 WHERE e2.dept_id = e.dept_id
)
ORDER BY e.salary DESC, e.name ASC;`,
    testCases: [
      {
        args: [],
        hidden: false,
        expected: [
          ["Asha", "Engineering", 9000],
          ["Emre", "Sales", 6000],
        ],
      },
      {
        args: [],
        hidden: false,
        setup: "UPDATE employees SET salary = 3000 WHERE name = 'Chen';",
        expected: [
          ["Asha", "Engineering", 9000],
          ["Bilal", "Engineering", 8000],
          ["Emre", "Sales", 6000],
        ],
      },
      {
        args: [],
        hidden: true,
        setup: "DELETE FROM employees WHERE name = 'Asha';",
        expected: [
          ["Bilal", "Engineering", 8000],
          ["Emre", "Sales", 6000],
        ],
      },
    ],
    timeLimitSec: 900,
    points: 15,
  },
  {
    externalId: "sql-customers-no-orders",
    skill: "DBMS",
    category: "coding",
    topic: "SQL Joins",
    difficulty: "easy",
    title: "Customers Who Never Ordered",
    description:
      "The `customers` table holds one row per customer; `orders` holds one row per order, referencing `customers.id`.\n\nWrite a single SELECT query that returns the **names of customers who have never placed an order**, as a single column named `name`.\n\n- A customer with zero rows in `orders` must appear exactly once.\n- A `LEFT JOIN … IS NULL` (anti-join) or `NOT EXISTS` both work.",
    schemaSql: `CREATE TABLE customers (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  total       REAL NOT NULL
);`,
    seedSql: `INSERT INTO customers (name) VALUES
  ('Aria Chen'), ('Boris Ilic'), ('Nora Feng'), ('Kabir Rao'), ('Lena Marsh');
INSERT INTO orders (customer_id, total) VALUES
  (1, 250.00), (1, 90.50), (2, 610.00), (4, 45.25);`,
    solutionSql: `SELECT c.name
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;`,
    testCases: [
      {
        args: [],
        hidden: false,
        expected: [["Nora Feng"], ["Lena Marsh"]],
        unordered: true,
      },
      {
        args: [],
        hidden: false,
        setup: "INSERT INTO orders (customer_id, total) VALUES (3, 700.00);",
        expected: [["Lena Marsh"]],
      },
      {
        args: [],
        hidden: true,
        setup: "DELETE FROM orders;",
        expected: [["Aria Chen"], ["Boris Ilic"], ["Nora Feng"], ["Kabir Rao"], ["Lena Marsh"]],
        unordered: true,
      },
    ],
    timeLimitSec: 600,
    points: 10,
  },
  {
    externalId: "sql-regions-above-threshold",
    skill: "DBMS",
    category: "coding",
    topic: "SQL Aggregates",
    difficulty: "medium",
    title: "Regions Above Sales Threshold",
    description:
      "The `sales` table records individual sale amounts per `region`.\n\nWrite a single SELECT query that returns, for every region whose **total sales exceed 10000**, two columns: `region` and `total_sales`.\n\n- Aggregates belong in the query — filter groups with `HAVING`, not a subquery on sums.\n- `total_sales` must be the exact `SUM(amount)`.",
    schemaSql: `CREATE TABLE sales (
  id     INTEGER PRIMARY KEY,
  region TEXT NOT NULL,
  amount REAL NOT NULL
);`,
    seedSql: `INSERT INTO sales (region, amount) VALUES
  ('North', 4200), ('North', 3900), ('North', 2500),
  ('South', 1500), ('South', 2000),
  ('East', 5100), ('East', 4950),
  ('West', 900);`,
    solutionSql: `SELECT region, SUM(amount) AS total_sales
FROM sales
GROUP BY region
HAVING SUM(amount) > 10000;`,
    testCases: [
      {
        args: [],
        hidden: false,
        expected: [["North", 10600], ["East", 10050]],
        unordered: true,
      },
      {
        args: [],
        hidden: false,
        setup: "INSERT INTO sales (region, amount) VALUES ('South', 7000);",
        expected: [["North", 10600], ["East", 10050], ["South", 10500]],
        unordered: true,
      },
      {
        args: [],
        hidden: true,
        setup: "DELETE FROM sales WHERE region = 'North';",
        expected: [["East", 10050]],
        unordered: true,
      },
    ],
    timeLimitSec: 720,
    points: 10,
  },
  {
    externalId: "sql-employee-manager-pairs",
    skill: "DBMS",
    category: "coding",
    topic: "SQL Self Joins",
    difficulty: "medium",
    title: "Employee–Manager Pairs",
    description:
      "The `employees` table references itself: each row's `manager_id` points at another row in the same table (the CEO's `manager_id` is NULL).\n\nWrite a single SELECT query that returns every employee **who has a manager** together with their manager's name, as two columns: `employee`, `manager`.\n\n- Employees without a manager (NULL `manager_id`) must NOT appear.\n- This is a self-join — aliase the table twice (`e` and `m`).",
    schemaSql: `CREATE TABLE employees (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  manager_id INTEGER REFERENCES employees(id)
);`,
    seedSql: `INSERT INTO employees (id, name, manager_id) VALUES
  (1, 'Priya Nair', NULL),
  (2, 'Tom Becker', 1),
  (3, 'Sara Ozdemir', 1),
  (4, 'Jae-won Park', 2),
  (5, 'Maya Krishnan', 2);`,
    solutionSql: `SELECT e.name AS employee, m.name AS manager
FROM employees e
JOIN employees m ON e.manager_id = m.id;`,
    testCases: [
      {
        args: [],
        hidden: false,
        expected: [
          ["Tom Becker", "Priya Nair"],
          ["Sara Ozdemir", "Priya Nair"],
          ["Jae-won Park", "Tom Becker"],
          ["Maya Krishnan", "Tom Becker"],
        ],
        unordered: true,
      },
      {
        args: [],
        hidden: false,
        setup: "DELETE FROM employees WHERE name = 'Tom Becker';",
        expected: [["Sara Ozdemir", "Priya Nair"]],
        unordered: true,
      },
      {
        args: [],
        hidden: true,
        setup: "UPDATE employees SET manager_id = NULL;",
        expected: [],
      },
    ],
    timeLimitSec: 720,
    points: 15,
  },
];

export const QUESTION_BANK: BankQuestion[] = [...CODING, ...DEBUGGING, ...MCQ, ...SQL];

/** Per-skill question pool, keyed by the `skill` field */
export const BANK_BY_SKILL: Record<string, BankQuestion[]> = (() => {
  const map: Record<string, BankQuestion[]> = {};
  for (const q of QUESTION_BANK) {
    (map[q.skill] ??= []).push(q);
  }
  return map;
})();
