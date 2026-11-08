// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

final class PriceLineLayerPool<Group> {
  private var active: [String: Group] = [:]
  private var spare: [Group] = []

  func reconcile<Lines: Sequence>(
    _ lines: Lines,
    id: (Lines.Element) -> String,
    acquire: (Group?) -> Group,
    hide: (Group) -> Void,
    apply: (Lines.Element, Group) -> Void
  ) {
    var visible = Set<String>()
    var added: [(String, Lines.Element)] = []
    for line in lines {
      let key = id(line)
      visible.insert(key)
      if let group = active[key] {
        apply(line, group)
      } else {
        added.append((key, line))
      }
    }

    // Retire missing IDs before allocating, including when every ID changes in one frame.
    for (key, group) in active where !visible.contains(key) {
      active.removeValue(forKey: key)
      hide(group)
      spare.append(group)
    }
    for (key, line) in added {
      let group = acquire(spare.popLast())
      active[key] = group
      apply(line, group)
    }
  }
}
