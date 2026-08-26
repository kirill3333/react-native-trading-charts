require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "TradingCharts"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.ios.deployment_target = "15.1"
  s.source       = { :git => "https://github.com/kirill3333/react-native-trading-charts.git", :tag => "v#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp,metal}", "cpp/**/*.{h,cc}"
  s.exclude_files = "cpp/tests/**/*", "cpp/benchmarks/**/*"
  s.private_header_files = "ios/**/*.h", "cpp/**/*.h"
  s.frameworks = "Metal", "MetalKit"
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "HEADER_SEARCH_PATHS" => "$(inherited) $(PODS_TARGET_SRCROOT)",
    "DEFINES_MODULE" => "YES"
  }

  install_modules_dependencies(s)
end
