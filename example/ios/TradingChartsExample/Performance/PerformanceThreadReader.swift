import Darwin
import Foundation

struct PerformanceThreadReader {
  static let jsThreadName = "com.facebook.react.runtime.JavaScript"

  static func currentThreadId() -> UInt64 {
    var identifier: UInt64 = 0
    pthread_threadid_np(nil, &identifier)
    return identifier
  }

  static func read(mainThreadId: UInt64) -> [PerformanceThread]? {
    var list: thread_act_array_t?
    var count: mach_msg_type_number_t = 0
    guard task_threads(mach_task_self_, &list, &count) == KERN_SUCCESS, let list else { return nil }
    defer {
      for index in 0..<Int(count) { mach_port_deallocate(mach_task_self_, list[index]) }
      vm_deallocate(
        mach_task_self_, vm_address_t(UInt(bitPattern: list)),
        vm_size_t(Int(count) * MemoryLayout<thread_act_t>.stride)
      )
    }
    return (0..<Int(count)).compactMap { index in
      let port = list[index]
      var identifier = thread_identifier_info_data_t()
      guard readInfo(port, flavor: THREAD_IDENTIFIER_INFO, into: &identifier) else { return nil }
      var basic = thread_basic_info_data_t()
      let hasCPU = readInfo(port, flavor: THREAD_BASIC_INFO, into: &basic)
      var extended = thread_extended_info_data_t()
      let hasName = readInfo(port, flavor: THREAD_EXTENDED_INFO, into: &extended)
      let name: String = hasName ? withUnsafeBytes(of: &extended.pth_name) { bytes in
        String(bytes: bytes.prefix(while: { $0 != 0 }), encoding: .utf8) ?? ""
      } : ""
      let seconds = Double(basic.user_time.seconds) + Double(basic.system_time.seconds)
        + (Double(basic.user_time.microseconds) + Double(basic.system_time.microseconds)) / 1_000_000
      return PerformanceThread(
        id: String(identifier.thread_id), name: name,
        isMainThread: identifier.thread_id == mainThreadId,
        isJSThread: name == jsThreadName, cpuSeconds: hasCPU ? seconds : nil
      )
    }.sorted { $0.id < $1.id }
  }

  private static func readInfo<Value>(_ port: thread_t, flavor: Int32, into value: inout Value) -> Bool {
    var count = mach_msg_type_number_t(MemoryLayout<Value>.size / MemoryLayout<integer_t>.size)
    return withUnsafeMutablePointer(to: &value) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        thread_info(port, thread_flavor_t(flavor), $0, &count) == KERN_SUCCESS
      }
    }
  }
}
