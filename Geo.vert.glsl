attribute vec3 LocalPosition;
attribute vec3 LocalUv;
attribute vec3 LocalNormal;
varying vec3 FragWorldPosition;
varying vec3 FragLocalPosition;
varying vec2 FragLocalUv;
varying vec3 FragCameraPosition;	//	position in camera space
varying vec2 FragViewUv;
varying vec3 ClipPosition;
varying vec4 FragColour;
varying vec3 FragLocalNormal;
varying vec3 FragWorldNormal;

attribute mat4 LocalToWorldTransform;
attribute vec3 WorldVelocity;
uniform mat4 WorldToCameraTransform;
uniform mat4 CameraProjectionTransform;
attribute vec4 Colour;

uniform float VelocityStretch;


vec3 GetWorldPos()
{
	vec4 WorldPos = LocalToWorldTransform * vec4(LocalPosition,1.0);
	WorldPos.xyz *= WorldPos.www;
	WorldPos.w = 1.0;

	vec4 OriginWorldPos = LocalToWorldTransform * vec4(0,0,0,1);
	OriginWorldPos.xyz *= OriginWorldPos.www;
	OriginWorldPos.w = 1.0;	
	
	//	stretch world pos along velocity
	vec3 TailDelta = -WorldVelocity * VelocityStretch * (1.0/60.0);
	
	//	old method
	//WorldPos.xyz += -WorldVelocity * 1.5 * LocalPosition.z;
	//return WorldPos.xyz;
	
	vec3 LocalPosInWorld = WorldPos.xyz - OriginWorldPos.xyz;
	
	//	this is the opposite of what it should be and shows the future
	//	but better than flashes of past that wasnt there (better if we just stored prev pos)
	vec3 NextPos = WorldPos.xyz - (TailDelta*0.9);
	vec3 PrevPos = WorldPos.xyz + (TailDelta*0.1);
	
	//	"lerp" between depending on whether we're at front or back
	//	^^ this is why we're getting angled shapes, even if we did a cut off we
	//	could have 1/8 verts in front
	
	//	gr; this nvidia object space motion blur stretches if the [current]normal 
	//		is inline(dot(next-prev,velocity)>0) with the motion vector(velocity)... in EYESPACE
	//	https://www.nvidia.com/docs/io/8230/gdc2003_openglshadertricks.pdf
	float Scale = dot( normalize(LocalPosInWorld), normalize(-TailDelta) );
	float Lerp = Scale > 0.0 ? 1.0 : 0.0;
	
	WorldPos.xyz = mix( PrevPos, NextPos, Lerp );
	return WorldPos.xyz;
}


void main()
{
	vec3 WorldPos = GetWorldPos();
	vec4 CameraPos = WorldToCameraTransform * vec4(WorldPos,1.0);	//	world to camera space
	vec4 ProjectionPos = CameraProjectionTransform * CameraPos;

	vec4 WorldNormal = LocalToWorldTransform * vec4(LocalNormal,0.0);
	WorldNormal.xyz = normalize(WorldNormal.xyz);


	gl_Position = ProjectionPos;
	
	FragViewUv = gl_Position.xy;
	ClipPosition = gl_Position.xyz / gl_Position.www;	//	not sure if this should divide...
	
	FragCameraPosition = CameraPos.xyz ;/// CameraPos.www;
	
	FragWorldPosition = WorldPos.xyz;
	//FragColour = Colour;//LocalPosition;
	FragColour = vec4( LocalUv, 1 );
	FragLocalPosition = LocalPosition;
	FragLocalUv = LocalUv.xy;
	FragColour = Colour;
	FragLocalNormal = LocalNormal;
	FragWorldNormal = WorldNormal.xyz;
}

