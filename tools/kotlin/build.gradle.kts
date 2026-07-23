import io.gitlab.arturbosch.detekt.Detekt
import org.gradle.api.attributes.Bundling

plugins {
  id("io.gitlab.arturbosch.detekt") version "1.23.8"
}

repositories {
  mavenCentral()
}

val repositoryRoot = layout.projectDirectory.dir("../..")
val kotlinSources =
  fileTree(repositoryRoot.dir("android/src/main/java/com/tradingcharts")) {
    include("**/*.kt")
  }

detekt {
  source.setFrom(kotlinSources)
  config.setFrom(layout.projectDirectory.file("detekt.yml"))
  buildUponDefaultConfig = true
  parallel = true
  basePath = repositoryRoot.asFile.absolutePath
}

tasks.withType<Detekt>().configureEach {
  reports {
    html.required.set(true)
    xml.required.set(true)
    sarif.required.set(true)
  }
}

val ktfmtTool by configurations.creating {
  attributes {
    attribute(Bundling.BUNDLING_ATTRIBUTE, objects.named(Bundling.SHADOWED))
  }
}

dependencies {
  ktfmtTool("com.facebook:ktfmt:0.64")
}

fun JavaExec.configureKtfmt() {
  classpath = ktfmtTool
  mainClass.set("com.facebook.ktfmt.cli.Main")
  workingDir = repositoryRoot.asFile
  doFirst {
    args(kotlinSources.files.sortedBy { it.absolutePath }.map { it.absolutePath })
  }
}

val ktfmtCheck by tasks.registering(JavaExec::class) {
  group = "verification"
  description = "Checks the library Kotlin sources with ktfmt."
  inputs.files(kotlinSources)
  args("--meta-style", "--dry-run", "--set-exit-if-changed")
  configureKtfmt()
}

val ktfmtFormat by tasks.registering(JavaExec::class) {
  group = "formatting"
  description = "Formats the library Kotlin sources with ktfmt."
  outputs.upToDateWhen { false }
  args("--meta-style")
  configureKtfmt()
}

tasks.register("kotlinCheck") {
  group = "verification"
  description = "Runs detekt and verifies ktfmt formatting."
  dependsOn(tasks.named("detekt"), ktfmtCheck)
}
