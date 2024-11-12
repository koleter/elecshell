def compute_prefix_function(pattern):
    m = len(pattern)
    prefix = [0] * m
    j = 0  # length of the previous longest prefix suffix

    for i in range(1, m):
        while j > 0 and pattern[i] != pattern[j]:
            j = prefix[j - 1]
        if pattern[i] == pattern[j]:
            j += 1
        prefix[i] = j

    return prefix

def kmp_search(text, pattern):
    n = len(text)
    m = len(pattern)
    prefix = compute_prefix_function(pattern)
    matches = []
    j = 0  # index for pattern

    for i in range(n):
        while j > 0 and text[i] != pattern[j]:
            j = prefix[j - 1]
        if text[i] == pattern[j]:
            j += 1
        if j == m:
            matches.append(i - m + 1)
            j = prefix[j - 1]

    return matches
