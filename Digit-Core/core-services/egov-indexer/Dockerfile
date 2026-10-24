FROM eclipse-temurin:17-jre-jammy
WORKDIR /opt/egov
COPY target/*.jar app.jar
ENV JAVA_OPTS="-Xmx192m -Xms192m"
ENTRYPOINT exec java $JAVA_OPTS $JAVA_ARGS -jar /opt/egov/app.jar
