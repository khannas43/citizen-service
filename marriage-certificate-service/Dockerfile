FROM eclipse-temurin:17-jre-jammy
WORKDIR /opt/app
COPY target/*.jar app.jar
ENTRYPOINT ["java", "-Xmx256m", "-Xms256m", "-jar", "/opt/app/app.jar"]
