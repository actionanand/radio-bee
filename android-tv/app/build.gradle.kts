import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val versionData = JsonSlurper().parse(rootProject.file("../tv-version.json")) as Map<*, *>
val tvCode = (versionData["versionCode"] as Number).toInt()

require(tvCode in 1_000_000_000..2_099_999_999) {
    "TV versionCode outside its globally reserved range"
}

val allowHttp =
    providers.gradleProperty("tvAllowHttpStreams").orElse("false").get().toBooleanStrict()

android {
    namespace = "com.actionanand.radiobee.tv"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.actionanand.radiobee.app"
        minSdk = 23
        targetSdk = 36
        versionCode = tvCode
        versionName = versionData["versionName"] as String
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField(
            "String",
            "CATALOG_URL",
            "\"https://actionanand.github.io/radio-bee-data/v2/\"",
        )
        buildConfigField("boolean", "ALLOW_UNVERIFIED", "true")
        buildConfigField("boolean", "CHECK_VERIFICATION_STATUS", "false")
        buildConfigField("boolean", "CHECK_RIGHTS_STATUS", "false")
        buildConfigField("boolean", "ALLOW_HTTP_STREAMS", allowHttp.toString())
        manifestPlaceholders["allowHttpStreams"] = allowHttp
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Signed by the release script, never by an embedded/local keystore.
        }
    }
    bundle { language { enableSplit = false } }
    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }
    testOptions { unitTests.isReturnDefaultValues = true }
    packaging { resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}") }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.10.01"))
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("com.caverock:androidsvg-aar:1.4")
    implementation("androidx.tv:tv-material:1.0.1")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.datastore:datastore-preferences:1.1.7")
    implementation("androidx.media3:media3-exoplayer:1.9.4")
    implementation("androidx.media3:media3-exoplayer-hls:1.9.4")
    implementation("androidx.media3:media3-session:1.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.10.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    debugImplementation("androidx.compose.ui:ui-tooling")
}

tasks.register<JavaExec>("verifyCatalogSnapshot") {
    dependsOn("testDebugUnitTest")
    mainClass.set("com.actionanand.radiobee.tv.data.CatalogProbe")
    doFirst {
        classpath = tasks.named<Test>("testDebugUnitTest").get().classpath
        args(providers.gradleProperty("tvCatalogSnapshot").get())
    }
}
