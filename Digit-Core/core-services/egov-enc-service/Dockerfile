FROM eclipse-temurin:17-jre-jammy
WORKDIR /opt/egov
COPY target/*.jar app.jar
ENV JAVA_OPTS="-Xmx256m -Xms256m"
ENTRYPOINT exec java $JAVA_OPTS $JAVA_ARGS -jar /opt/egov/app.jar
