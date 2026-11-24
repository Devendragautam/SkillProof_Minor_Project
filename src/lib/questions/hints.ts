/**
 * Curated hints for coding & debugging questions.
 * Hints are a disclosed aid: each reveal is recorded as evidence
 * (behavior feed + live proctoring) and applies a small, transparent
 * score adjustment (−4% per hint, max 12%).
 */
export const QUESTION_HINTS: Record<string, string> = {
  // ── coding ──────────────────────────────────────────────────────────────
  "code-two-sum":
    "Use a hash map of value → index while scanning once; for each number check if `target − num` was already seen.",
  "code-valid-parentheses":
    "Push every opening bracket onto a stack; on a closing bracket, the stack top must be its matching opener.",
  "code-climb-stairs":
    "The answer at step n is the sum of the answers at n−1 and n−2 — keep the last two values instead of an array.",
  "code-valid-anagram":
    "Count character frequencies in one pass with a 26-slot array (or a Map), then compare the two counts.",
  "code-max-subarray":
    "Kadane's algorithm: track the best subarray ending here — either extend the previous run or restart at this element.",
  "code-longest-substring":
    "Slide a window: move the right edge forward, and when a repeat appears inside the window, move the left edge past it.",
  "code-merge-intervals":
    "Sort by start time, then walk through merging each interval into the last one on the result while they overlap.",
  "code-product-except-self":
    "Two sweeps: first store the product of everything left of i, then multiply in the running product of everything right of i.",
  "code-search-range":
    "Two binary searches — one biased to find the leftmost match, one biased to find the rightmost.",
  "code-group-anagrams":
    "Every anagram shares one canonical key: the sorted string (or a 26-letter count signature). Group by that key in a Map.",
  "code-top-k-frequent":
    "Count frequencies with a Map, then either sort the entries or use a bucket array indexed by frequency.",
  "code-number-of-islands":
    "Scan every cell; when you find land, flood-fill (DFS/BFS) to sink the whole island and increment your counter.",
  "code-coin-change":
    "Bottom-up DP: `dp[amount] = 1 + min(dp[amount − coin])` over all coins; seed dp[0] = 0 and treat unreachable as Infinity.",
  "code-longest-palindrome":
    "Count each character; the answer uses all pairs (each contributes 2) plus one odd character in the middle if any exist.",
  "code-trapping-rain-water":
    "Water above bar i is min(max height to the left, max height to the right) − height[i]; compute both with a two-pointer sweep.",
  "code-flatten-object":
    "Recurse with a path prefix: for each key, if the value is a plain object walk deeper with `prefix + '.' + key` (skip empty objects); otherwise write the primitive or array at the joined path.",
  "code-min-stack":
    "Keep a second stack of running minimums — push the new min (or repeat the current min) alongside every push so getMin is just a peek at the top.",
  "code-insert-interval":
    "Three phases: copy every interval ending before newInterval starts, merge the new interval with every one it overlaps (grow its ends), then append the rest.",
  "dbg-closure-counter":
    "Loop variables declared with `var` are function-scoped — every closure shares one binding that is already n by call time. Scope a fresh binding per iteration.",
  "code-kth-largest":
    "A min-heap of size k (or quickselect) finds the k-th largest without fully sorting — partition around a pivot and recurse one side.",
  "code-lis":
    "DP over positions: ends[i] is the smallest tail of an increasing subsequence of length i+1 — binary search where the current number fits.",
  "code-rotate-image":
    "Rotate = transpose across the main diagonal, then reverse each row — both in place with two index loops.",
  "code-min-path-sum":
    "Grid DP: each cell's best cost is its own value plus the min of the cell above and the cell to the left.",
  "code-course-schedule":
    "This is cycle detection on a directed graph — Kahn's topological sort (in-degrees + queue) detects whether all courses can be ordered.",
  "code-min-window-substring":
    "Expand the window until it covers all required counts, then contract from the left while it stays valid, recording the smallest valid window.",
  "code-town-judge":
    "Count with two arrays: trust out-degree and in-degree per person. The judge is the one with in-degree n − 1 and out-degree 0 (at most one can exist).",
  "code-rotten-oranges":
    "Multi-source BFS: seed the queue with every rotten orange, then expand level by level — each level is one minute. Track remaining fresh count; if it isn't 0 at the end, return −1.",
  "code-word-break":
    "DP over prefixes: dp[i] = true if some earlier prefix dp[j] is true and s.slice(j, i) is a dictionary word. dp[0] is the empty-string base case.",
  "code-partition-subset":
    "If the total is odd, answer is false. Otherwise it's a 0/1-knapsack reachability: dp[j] = can some subset sum to j; iterate each number downward so it's used once.",
  "code-network-delay":
    "Single-source shortest paths with Dijkstra (all weights positive): repeatedly finalize the closest unfinalized node and relax its edges. The answer is the max distance; an Infinity distance means −1.",
  // ── debugging ───────────────────────────────────────────────────────────
  "dbg-binary-search":
    "Trace one failing case by hand: check how the loop updates `left`/`right` and whether `mid` can ever be skipped or re-scanned.",
  "dbg-palindrome-check":
    "Compare characters from both ends moving inward — check the pointer update direction and the loop's stop condition.",
  "dbg-bubble-sort":
    "Watch the inner loop's bounds: after pass k the last k elements are already in place — are they being re-compared?",
  "dbg-fibonacci":
    "Print the first few outputs: is the sequence starting at the right seed values, and is the recurrence using the two previous terms?",
  "dbg-valid-paren":
    "A close must match the most recent unclosed opener — check what happens when the bracket types differ or the stack is empty.",
  "dbg-anagram-count":
    "Count once per group, not per member: verify whether the code counts each word itself as its own anagram partner.",
  "dbg-missing-number":
    "The sum of 0..n is n(n+1)/2 — check whether the loop range or the subtraction covers every expected value exactly once.",
  "dbg-rotate-array":
    "Try rotating by one position mentally, then by k: check where the tail elements land when k exceeds the array length.",
  "dbg-repeat-string":
    "Count the iterations: `i <= n` runs n + 1 times (0 through n). A repetition of n copies needs exactly n iterations.",
  "dbg-sum-evens":
    "Check the filter on one example: n % 2 === 1 is true for odd numbers. Even numbers satisfy n % 2 === 0 (and negatives like −2 too).",
  "dbg-numeric-sort":
    "JavaScript's default sort compares stringified values, so 10 < 2 lexicographically. Pass a numeric comparator: (a, b) => a − b, then decide how to get descending order.",
  // ── SQL (coding-category; the candidate writes a single SELECT) ─────────
  "sql-second-highest-salary":
    "Deduplicate first: SELECT DISTINCT salary (or GROUP BY salary) ordered descending, then skip the top row — LIMIT 1 OFFSET 1. The no-second-salary case must return no rows, which is exactly what an empty OFFSET result does.",
  "sql-department-top-earner":
    "Join departments to employees and take MAX(salary) GROUP BY department. A LEFT JOIN from departments keeps empty departments — their MAX is NULL, which is the required shape.",
  "sql-monthly-order-volume":
    "SQLite's strftime('%Y-%m', placed_on) gives the month key. GROUP BY it, COUNT(*) and ROUND(SUM(amount), 2), then ORDER BY the month key ascending.",
  "sql-avg-salary-by-department":
    "JOIN employees to departments, AVG(salary) wrapped in ROUND(..., 1), GROUP BY the department. An INNER JOIN drops empty departments naturally; ORDER BY the average descending, name ascending for ties.",
  "sql-above-dept-average":
    "Correlated subquery: compare each employee's salary with AVG over employees in the SAME department (match dept_id in the inner query). Strictly greater-than keeps exact-average earners out.",
  // ── C++-skill coding pool ─────────────────────────────────────────────────
  "cpp-code-rotate-array":
    "Reduce k to k % n first. The classic trick: reverse the whole array, then reverse the first k elements, then the rest — or just slice: nums.slice(n − k) followed by nums.slice(0, n − k).",
  "cpp-code-move-zeroes":
    "Two pointers: one writes the next non-zero position, the other scans. Copy every non-zero forward, then fill the tail with zeros.",
  "cpp-code-kth-largest":
    "Keep a min-heap of size k: push each number, pop the smallest when the heap exceeds k — the heap top is the k-th largest. (std::nth_element or a sort also work.)",
  "cpp-code-merge-sorted":
    "Walk both arrays with two pointers, always emitting the smaller head; then append whatever remains in either array.",
  // ── SQL additions ─────────────────────────────────────────────────────────
  "sql-customers-no-orders":
    "Anti-join: LEFT JOIN orders ON orders.customer_id = customers.id and keep only rows WHERE orders.id IS NULL (or use NOT EXISTS with a correlated subquery).",
  "sql-regions-above-threshold":
    "GROUP BY region, compute SUM(amount) AS total_sales, then filter groups with HAVING SUM(amount) > 10000 — WHERE can't see aggregates.",
  "sql-employee-manager-pairs":
    "Join employees to itself: FROM employees e JOIN employees m ON e.manager_id = m.id. The INNER JOIN drops the NULL-manager (CEO) row automatically; select e.name AS employee, m.name AS manager.",
};
