import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ProjectInfo } from '../shared/types'
import { gradleVersionFor } from './minecraftRuntime'
import { javaVersionForMinecraft } from './loaderCatalog'

export function githubWorkflow(project: ProjectInfo): string {
  const javaVersion = project.javaVersion ?? javaVersionForMinecraft(project.minecraftVersion)
  const gradleVersion = gradleVersionFor(project)
  return `name: Mod build

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: \${{ matrix.os }}
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '${javaVersion}'
      - uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '${gradleVersion}'
      - name: Build and test
        run: gradle build --no-daemon --stacktrace
      - uses: actions/upload-artifact@v4
        if: matrix.os == 'ubuntu-latest'
        with:
          name: ${project.namespace}-\${{ github.sha }}
          path: build/libs/*.jar
          if-no-files-found: error
`
}

export function loaderMatrixWorkflow(): string {
  return `name: ModMind loader matrix

on:
  workflow_dispatch:
  push:
    paths:
      - 'src/**'
      - 'src/main/projectTemplates.ts'
      - 'src/main/loaderCatalog.ts'
      - 'src/main/minecraftRuntime.ts'
      - '.github/workflows/mod-loader-matrix.yml'

permissions:
  contents: read

jobs:
  template-build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - loader: fabric
            minecraft: '1.21.1'
            loaderVersion: '0.16.10'
            apiVersion: '0.116.13+1.21.1'
            java: 21
            gradle: '8.12.1'
          - loader: quilt
            minecraft: '1.20.1'
            loaderVersion: '0.27.1'
            apiVersion: '7.7.0+0.92.2-1.20.1'
            java: 17
            gradle: '8.4'
          - loader: forge
            minecraft: '1.20.1'
            loaderVersion: '1.20.1-47.4.0'
            java: 17
            gradle: '8.12.1'
          - loader: neoforge
            minecraft: '1.21.1'
            loaderVersion: '21.1.244'
            java: 21
            gradle: '8.12.1'
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Generate template project
        shell: bash
        env:
          LOADER: \${{ matrix.loader }}
          MINECRAFT: \${{ matrix.minecraft }}
          LOADER_VERSION: \${{ matrix.loaderVersion }}
          API_VERSION: \${{ matrix.apiVersion }}
          JAVA_VERSION: \${{ matrix.java }}
        run: npx vite-node scripts/generate-loader-fixture.ts matrix-project
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: \${{ matrix.java }}
      - uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: \${{ matrix.gradle }}
      - name: Build generated Loader fixture
        run: cd matrix-project && gradle build --no-daemon --stacktrace
`
}

export async function generateGithubWorkflow(project: ProjectInfo): Promise<string> {
  const relative = '.github/workflows/mod-build.yml'
  const target = path.join(project.path, ...relative.split('/'))
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, githubWorkflow(project), 'utf8')
  return relative
}
